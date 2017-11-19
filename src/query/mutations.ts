import { FieldRequest } from '../graphql/query-distiller';
import {FieldDefinitionNode, getNamedType, GraphQLObjectType, GraphQLType} from 'graphql';
import {
    AddEdgesQueryNode, BasicType, BinaryOperationQueryNode, BinaryOperator, ConcatListsQueryNode, ConditionalQueryNode,
    CreateEntityQueryNode, DeleteEntitiesQueryNode, EdgeFilter, EdgeIdentifier, FieldQueryNode, FirstOfListQueryNode,
    ListQueryNode, LiteralQueryNode, MergeObjectsQueryNode, NullQueryNode, ObjectQueryNode, PartialEdgeIdentifier,
    PropertySpecification, QueryNode, RemoveEdgesQueryNode, RootEntityIDQueryNode, SetEdgeQueryNode,
    TransformListQueryNode, TypeCheckQueryNode, UnaryOperationQueryNode, UnaryOperator, UpdateEntitiesQueryNode,
    VariableAssignmentQueryNode, VariableQueryNode
} from './definition';
import {
    ADD_CHILD_ENTITIES_FIELD_PREFIX, CALC_MUTATIONS_OPERATORS,
    CREATE_ENTITY_FIELD_PREFIX, DELETE_ENTITY_FIELD_PREFIX, ENTITY_CREATED_AT, ENTITY_UPDATED_AT, ID_FIELD,
    MUTATION_ID_ARG,
    MUTATION_INPUT_ARG, MutationType, NAMESPACE_FIELD_PATH_DIRECTIVE, REMOVE_CHILD_ENTITIES_FIELD_PREFIX,
    UPDATE_CHILD_ENTITIES_FIELD_PREFIX,
    UPDATE_ENTITY_FIELD_PREFIX
} from '../schema/schema-defaults';
import { createEntityObjectNode } from './queries';
import {
    hasDirectiveWithName, isCalcMutationField,
    isChildEntityType, isEntityExtensionType, isRelationField, isRootEntityType, isTypeWithIdentity,
    isWriteProtectedSystemField
} from '../schema/schema-utils';
import { AnyValue, decapitalize, filterProperties, mapValues, objectValues, PlainObject } from '../utils/utils';
import {
    getAddChildEntityFieldName, getAddRelationFieldName, getRemoveChildEntityFieldName, getRemoveRelationFieldName,
    getUpdateChildEntityFieldName
} from '../graphql/names';
import { isListType } from '../graphql/schema-utils';
import { EdgeType, getEdgeType } from '../schema/edges';
import uuid = require('uuid');

/**
 * Creates a QueryNode for a field of the root mutation type
 * @param {FieldRequest} fieldRequest the mutation field, such as createSomeEntity
 */
export function createMutationNamespaceNode(fieldRequest: FieldRequest, fieldRequestStack: FieldRequest[]): QueryNode {
    if (fieldRequest.fieldName.startsWith(CREATE_ENTITY_FIELD_PREFIX)) {
        return createCreateEntityQueryNode(fieldRequest, [...fieldRequestStack, fieldRequest]);
    }

    if (fieldRequest.fieldName.startsWith(UPDATE_ENTITY_FIELD_PREFIX)) {
        return createUpdateEntityQueryNode(fieldRequest, [...fieldRequestStack, fieldRequest]);
    }

    if (fieldRequest.fieldName.startsWith(DELETE_ENTITY_FIELD_PREFIX)) {
        return createDeleteEntityQueryNode(fieldRequest, [...fieldRequestStack, fieldRequest]);
    }

    if (fieldRequest.field.type instanceof GraphQLObjectType && hasDirectiveWithName(fieldRequest.field.astNode as FieldDefinitionNode, NAMESPACE_FIELD_PATH_DIRECTIVE)) {
        return createMutationNamespaceFieldNode(fieldRequest, [...fieldRequestStack, fieldRequest])
    }

    console.log(`unknown field: ${fieldRequest.fieldName}`);
    return new NullQueryNode();
}

function createMutationNamespaceFieldNode(fieldRequest: FieldRequest, fieldRequestStack: FieldRequest[]): QueryNode {
    return new ObjectQueryNode(fieldRequest.selectionSet.map(
        sel => new PropertySpecification(sel.propertyName,
            // a namespace can be interpreted as pushing the root node down.
            createMutationNamespaceNode(sel.fieldRequest, fieldRequestStack))));
}

function createCreateEntityQueryNode(fieldRequest: FieldRequest, fieldRequestStack: FieldRequest[]): QueryNode {
    const entityName = fieldRequest.fieldName.substr('create'.length);
    const entityType = fieldRequest.schema.getTypeMap()[entityName];
    if (!entityType || !(entityType instanceof GraphQLObjectType)) {
        throw new Error(`Object type ${entityName} not found but needed for field ${fieldRequest.fieldName}`);
    }
    const input = fieldRequest.args[MUTATION_INPUT_ARG];
    const objectNode = new LiteralQueryNode(prepareMutationInput(input, entityType, MutationType.CREATE));
    const createEntityNode = new CreateEntityQueryNode(entityType, objectNode);
    const newEntityVarNode = new VariableQueryNode('newEntity');
    let resultNode: QueryNode = createEntityObjectNode(fieldRequest.selectionSet, newEntityVarNode, fieldRequestStack);
    const relationStatements = getRelationAddRemoveStatements(input, entityType, newEntityVarNode, false);
    if (relationStatements.length) {
        resultNode = new FirstOfListQueryNode(new ListQueryNode([
            resultNode,
            ...relationStatements
        ]));
    }
    return new VariableAssignmentQueryNode({
        variableValueNode: createEntityNode,
        resultNode,
        variableNode: newEntityVarNode
    });
}

function prepareMutationInput(input: PlainObject, objectType: GraphQLObjectType, mutationType: MutationType): PlainObject {
    if (isChildEntityType(objectType)) {
        input = {
            ...input,
            [ENTITY_UPDATED_AT]: getCurrentISODate()
        };
        if (mutationType === MutationType.CREATE) {
            input[ID_FIELD] = uuid();
            input[ENTITY_CREATED_AT] = getCurrentISODate();
        }
    }

    if (isRootEntityType(objectType)) {
        if (mutationType === MutationType.CREATE) {
            // remove relation fields as they are treated by createCreateEntityQueryNode directly and should not be part
            // of the created object
            input = {
                ...filterProperties(input, (value, key) => !isRelationField(objectType.getFields()[key])),
                [ENTITY_CREATED_AT]: getCurrentISODate(),
                [ENTITY_UPDATED_AT]: getCurrentISODate()
            };
        } else {
            input = {
                ...input,
                [ENTITY_UPDATED_AT]: getCurrentISODate()
            }
        }
    }

    function prepareFieldValue(value: AnyValue, fieldType: GraphQLType, mutationType: MutationType): AnyValue {
        const rawType = getNamedType(fieldType);
        if (isListType(fieldType)) {
            return (value as AnyValue[]).map(itemValue => prepareFieldValue(itemValue, rawType, mutationType));
        }
        if (rawType instanceof GraphQLObjectType && (isEntityExtensionType(rawType) || isChildEntityType(rawType))) {
            return prepareMutationInput(value as PlainObject, rawType, mutationType);
        }
        // scalars and value objects can be used as-is
        return value;
    }

    function keyWithoutPrefix(key: string, prefix: string): string | undefined {
        if(key.startsWith(prefix)) {
            return decapitalize(key.substring(prefix.length));
        } else {
            return undefined;
        }
    }

    // recursive calls
    return mapValues(input, (fieldValue, key) => {
        let objFields = objectType.getFields();

        if (objFields[key]) {
            // input field for plain object fields
            return prepareFieldValue(fieldValue, objFields[key].type, mutationType)
        } else {
            // must be a (gnerated) special input field
            const possiblePrefixes: string[] = [
                ADD_CHILD_ENTITIES_FIELD_PREFIX,
                UPDATE_CHILD_ENTITIES_FIELD_PREFIX,
                REMOVE_CHILD_ENTITIES_FIELD_PREFIX,
                ...CALC_MUTATIONS_OPERATORS.map(op => op.prefix)];
            for (const prefix of possiblePrefixes) {
                let withoutPrefix = keyWithoutPrefix(key, prefix);
                if(withoutPrefix && objFields[withoutPrefix]) {
                    switch(prefix) {
                        case ADD_CHILD_ENTITIES_FIELD_PREFIX: {
                            // oh, adding child entities is create, not update!
                            // btw, once create => always create!
                            return prepareFieldValue(fieldValue, objFields[withoutPrefix].type, MutationType.CREATE)
                        }
                        case UPDATE_CHILD_ENTITIES_FIELD_PREFIX: {
                            return prepareFieldValue(fieldValue, objFields[withoutPrefix].type, mutationType)
                        }
                        default: {
                            // the remaining special input fields do not need further treatment.
                            // e.g. REMOVE_CHILD_ENTITIES_FIELD_PREFIX, CALC_MUTATIONS_OPERATORS
                            return fieldValue;
                        }
                    }
                }
            }
            throw new Error(`Mutation input field named "${key}" does neither match to a plain object field, nor to a known special input field pattern.`);
        }
    });
}

function createUpdateEntityQueryNode(fieldRequest: FieldRequest, fieldRequestStack: FieldRequest[]): QueryNode {
    const entityName = fieldRequest.fieldName.substr('create'.length);
    const entityType = fieldRequest.schema.getTypeMap()[entityName];
    if (!entityType || !(entityType instanceof GraphQLObjectType)) {
        throw new Error(`Object type ${entityName} not found but needed for field ${fieldRequest.fieldName}`);
    }
    const input = prepareMutationInput(fieldRequest.args[MUTATION_INPUT_ARG], entityType, MutationType.UPDATE);
    const currentEntityVarNode = new VariableQueryNode('currentEntity');
    const filterNode = new BinaryOperationQueryNode(new RootEntityIDQueryNode(currentEntityVarNode),
        BinaryOperator.EQUAL,
        new LiteralQueryNode(input[ID_FIELD]));
    const updateEntityNode = new FirstOfListQueryNode(new UpdateEntitiesQueryNode({
        objectType: entityType,
        filterNode,
        updates: createUpdatePropertiesSpecification(input, entityType, currentEntityVarNode),
        maxCount: 1,
        currentEntityVariable: currentEntityVarNode
    }));

    const updatedEntityVarNode = new VariableQueryNode('updatedEntity');
    let resultNode: QueryNode = createEntityObjectNode(fieldRequest.selectionSet, updatedEntityVarNode, fieldRequestStack);

    // put these statements here because they need to be executed in the context of the updated variable
    const relationStatements = getRelationAddRemoveStatements(input, entityType, updatedEntityVarNode, true);
    if (relationStatements.length) {
        resultNode = new FirstOfListQueryNode(new ListQueryNode([
            resultNode,
            ...relationStatements
        ]));
    }

    const conditionalResultNode = new ConditionalQueryNode( // updated entity may not exist
        new TypeCheckQueryNode(updatedEntityVarNode, BasicType.OBJECT),
        resultNode,
        new NullQueryNode());
    return new VariableAssignmentQueryNode({
        variableNode: updatedEntityVarNode,
        variableValueNode: updateEntityNode,
        resultNode: conditionalResultNode
    });
}

function getRelationAddRemoveStatements(obj: PlainObject, parentType: GraphQLObjectType, sourceEntityNode: QueryNode, isAddRemove: boolean): QueryNode[] {
    // note: we don't check if the target ids exists. This would be a constraint that will be checked in Foxx once we
    // implement Foxx. It's not easy to do this in AQL because we can't throw errors in AQL.

    const relationFields = objectValues(parentType.getFields()).filter(field => isRelationField(field));
    const statements: QueryNode[] = [];
    for (const field of relationFields) {
        const edgeType = getEdgeType(parentType, field);
        const sourceIDNode = new RootEntityIDQueryNode(sourceEntityNode);
        if (isListType(field.type)) {
            // to-n relation
            const idsToBeAdded = (isAddRemove ? obj[getAddRelationFieldName(field.name)] : obj[field.name]) as {}[] | undefined || [];
            const idsToBeRemoved = isAddRemove ? (obj[getRemoveRelationFieldName(field.name)] || []) as {}[] : [];
            if (idsToBeAdded.length && idsToBeRemoved.length) {
                throw new Error(`Currently, it is not possible to use add and remove on the same relation in one mutation`);
            }

            if (idsToBeAdded.length) {
                const edgeNodes = idsToBeAdded.map(id => getEdgeIdentifier({
                    edgeType,
                    sourceIDNode,
                    targetIDNode: new LiteralQueryNode(id),
                    sourceType: parentType
                }));
                statements.push(new AddEdgesQueryNode(edgeType, edgeNodes));
            }

            if (idsToBeRemoved.length) {
                statements.push(new RemoveEdgesQueryNode(edgeType, getEdgeFilter({
                    edgeType,
                    sourceType: parentType,
                    sourceIDNodes: [sourceIDNode],
                    targetIDNodes: idsToBeRemoved.map(id => new LiteralQueryNode(id))
                })));
            }
        } else if (field.name in obj) {
            // to-1 relation
            const newID = obj[field.name];
            if (newID) {
                // set related entity
                statements.push(new SetEdgeQueryNode({
                    edgeType,
                    existingEdgeFilter: getPartialEdgeIdentifier({
                        edgeType,
                        sourceType: parentType,
                        sourceIDNode
                    }),
                    newEdge: getEdgeIdentifier({
                        edgeType,
                        sourceType: parentType,
                        sourceIDNode,
                        targetIDNode: new LiteralQueryNode(newID)
                    })
                }));
            } else {
                // remove relation
                statements.push(new RemoveEdgesQueryNode(
                    edgeType,
                    getEdgeFilter({
                        edgeType,
                        sourceType: parentType,
                        sourceIDNodes: [sourceIDNode]
                    })
                ));
            }
        }
    }
    return statements;
}

/**
 * Creates an Edge identifier. Reorders source/target so that they match from/to in the edgeType
 */
function getEdgeIdentifier(param: { edgeType: EdgeType; sourceIDNode: QueryNode; targetIDNode: QueryNode; sourceType: GraphQLObjectType }): EdgeIdentifier {
    if (param.sourceType == param.edgeType.fromType) {
        return new EdgeIdentifier(param.sourceIDNode, param.targetIDNode);
    } else {
        return new EdgeIdentifier(param.targetIDNode, param.sourceIDNode);
    }
}

/**
 * Creates a partial edge identifier of the format ?->id or id->?
 */
function getPartialEdgeIdentifier(param: { edgeType: EdgeType; sourceIDNode: QueryNode; sourceType: GraphQLObjectType }): PartialEdgeIdentifier {
    if (param.sourceType == param.edgeType.fromType) {
        return new PartialEdgeIdentifier(param.sourceIDNode, undefined);
    } else {
        return new PartialEdgeIdentifier(undefined, param.sourceIDNode);
    }
}

/**
 * Creates an Edge filter. Reorders source/target so that they match from/to in the edgeType
 */
function getEdgeFilter(param: { edgeType: EdgeType; sourceIDNodes?: QueryNode[]; targetIDNodes?: QueryNode[]; sourceType: GraphQLObjectType }): EdgeFilter {
    if (param.sourceType == param.edgeType.fromType) {
        return new EdgeFilter(param.sourceIDNodes, param.targetIDNodes);
    } else {
        return new EdgeFilter(param.targetIDNodes, param.sourceIDNodes);
    }
}

function getCurrentISODate() {
    return new Date().toISOString();
}

function createUpdatePropertiesSpecification(obj: any, objectType: GraphQLObjectType, oldEntityNode: QueryNode): PropertySpecification[] {
    if (typeof obj != 'object') {
        return [];
    }

    const properties: PropertySpecification[] = [];
    for (const field of objectValues(objectType.getFields())) {
        if (isEntityExtensionType(getNamedType(field.type)) && field.name in obj) {
            // call recursively and use update semantic (leave fields that are not specified as-is
            const sourceNode = new FieldQueryNode(oldEntityNode, field);
            const valueNode = new MergeObjectsQueryNode([
                sourceNode,
                new ObjectQueryNode(createUpdatePropertiesSpecification(obj[field.name], getNamedType(field.type) as GraphQLObjectType, sourceNode))
            ]);
            properties.push(new PropertySpecification(field.name, valueNode));
        } else if (isChildEntityType(getNamedType(field.type))) {
            const childEntityType = getNamedType(field.type) as GraphQLObjectType;
            const idField = childEntityType.getFields()[ID_FIELD];

            // first add, then delete, then update
            // -> delete trumps add
            // -> new values can be updated
            // -> update operates on reduced list (delete ones do not generate overhead)
            // generates a query like this:
            // FOR obj IN [...existing, ...newValues] FILTER !(obj.id IN removedIDs) RETURN obj.id == updateID ? update(obj) : obj
            const rawExistingNode = new FieldQueryNode(oldEntityNode, field);
            let currentNode: QueryNode = new ConditionalQueryNode( // fall back to empty list if property is not a list
                new TypeCheckQueryNode(rawExistingNode, BasicType.LIST), rawExistingNode, new ListQueryNode([]));

            const newValues: any[] | undefined = obj[getAddChildEntityFieldName(field.name)];
            if (newValues) {
                // call prepareMutationInput() to assign uuids to new child entities (possibly recursively)
                // wrap the whole thing into a LiteralQueryNode instead of them individually so that only one bound variable is used
                const preparedNewValues = newValues.map(value => prepareMutationInput(value, childEntityType, MutationType.CREATE));
                const newNode = new LiteralQueryNode(preparedNewValues);
                currentNode = new ConcatListsQueryNode([currentNode, newNode]);
            }

            const childEntityVarNode = new VariableQueryNode(decapitalize(childEntityType.name));
            const childIDQueryNode = new FieldQueryNode(childEntityVarNode, idField);

            const removedIDs: number[] | undefined = obj[getRemoveChildEntityFieldName(field.name)];
            let removalFilterNode: QueryNode | undefined = undefined;
            if (removedIDs && removedIDs.length) {
                // FILTER !(obj.id IN [...removedIDs])
                removalFilterNode = new UnaryOperationQueryNode(
                    new BinaryOperationQueryNode(
                        childIDQueryNode,
                        BinaryOperator.IN,
                        new LiteralQueryNode(removedIDs)
                    ),
                    UnaryOperator.NOT
                );
            }

            const updatedValues: any[] | undefined = obj[getUpdateChildEntityFieldName(field.name)];
            let updateMapNode: QueryNode | undefined = undefined;
            if (updatedValues && updatedValues.length) {
                // build an ugly conditional tree
                // looks like this:
                // - item
                // - item.id == 1 ? update1(item) : item
                // - item.id == 2 ? update2(item) : (item.id == 1 ? update1(item) : item)
                // ...
                updateMapNode = childEntityVarNode;

                for (const value of updatedValues) {
                    const filterNode = new BinaryOperationQueryNode(childIDQueryNode, BinaryOperator.EQUAL, new LiteralQueryNode(value[ID_FIELD]));
                    const updateNode = new MergeObjectsQueryNode([
                        childEntityVarNode,
                        new ObjectQueryNode(createUpdatePropertiesSpecification(value, childEntityType, childEntityVarNode))
                    ]);
                    updateMapNode = new ConditionalQueryNode(filterNode, updateNode, updateMapNode);
                }
            }

            if (removalFilterNode || updateMapNode) {
                currentNode = new TransformListQueryNode({
                    listNode: currentNode,
                    filterNode: removalFilterNode,
                    innerNode: updateMapNode,
                    itemVariable: childEntityVarNode
                });
            }

            properties.push(new PropertySpecification(field.name, currentNode));
        } else if (isRelationField(field)) {
            // do nothing because relations are not represented in the update property specification, they are
            // considered by createUpdateEntityQueryNode directly
        } else if (isWriteProtectedSystemField(field, objectType)) {
            // this field must not be updated (may exist in schema for other purposes like filtering for an entity)
        } else  {
            // scalars and value objects
            let valueNode: QueryNode | undefined = undefined;
            if (field.name in obj) {
                valueNode = new LiteralQueryNode(obj[field.name]);
            }

            if(isCalcMutationField(field)) {
                for (const operator of CALC_MUTATIONS_OPERATORS) {
                    const inputCalcFieldName = operator.prefix + field.name;
                    const binaryOperator: BinaryOperator = BinaryOperator[operator.name];
                    if((inputCalcFieldName) in obj) {
                        valueNode = new BinaryOperationQueryNode(
                            valueNode || new FieldQueryNode(oldEntityNode, field),
                            binaryOperator,
                            new LiteralQueryNode(obj[inputCalcFieldName]))
                    }
                }
            }

            if(valueNode) {
                properties.push(new PropertySpecification(field.name, valueNode));
            }
        }
    }

    // if any property has been updated on an entity, set its update timestamp
    if (properties.length && isTypeWithIdentity(objectType)) {
        properties.push(new PropertySpecification(UPDATE_ENTITY_FIELD_PREFIX, new LiteralQueryNode(getCurrentISODate())));
    }

    return properties;
}

function createDeleteEntityQueryNode(fieldRequest: FieldRequest, fieldRequestStack: FieldRequest[]): QueryNode {
    const entityName = fieldRequest.fieldName.substr('create'.length);
    const entityType = fieldRequest.schema.getTypeMap()[entityName];
    if (!entityType || !(entityType instanceof GraphQLObjectType)) {
        throw new Error(`Object type ${entityName} not found but needed for field ${fieldRequest.fieldName}`);
    }
    const input = fieldRequest.args[MUTATION_ID_ARG];

    const currentEntityVarNode = new VariableQueryNode('currentEntity');
    const filterNode = new BinaryOperationQueryNode(new RootEntityIDQueryNode(currentEntityVarNode),
        BinaryOperator.EQUAL,
        new LiteralQueryNode(input));
    const deleteEntityNode = new FirstOfListQueryNode(new DeleteEntitiesQueryNode({
        objectType: entityType,
        maxCount: 1,
        filterNode,
        currentEntityVariable: currentEntityVarNode
    }));
    const deletedEntityVarNode = new VariableQueryNode('deletedEntity');
    const resultNode = createEntityObjectNode(fieldRequest.selectionSet, deletedEntityVarNode, fieldRequestStack);
    const conditionalResultNode = new ConditionalQueryNode( // updated entity may not exist
        new TypeCheckQueryNode(deletedEntityVarNode, BasicType.OBJECT),
        resultNode,
        new NullQueryNode());
    return new VariableAssignmentQueryNode({
        resultNode: conditionalResultNode,
        variableValueNode: deleteEntityNode,
        variableNode: deletedEntityVarNode
    });
}
