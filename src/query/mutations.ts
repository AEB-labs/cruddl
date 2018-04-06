import { AccessOperation } from '../authorization/auth-basics';
import {FieldRequest} from '../graphql/query-distiller';
import {FieldDefinitionNode, getNamedType, GraphQLField, GraphQLObjectType, GraphQLType} from 'graphql';
import {
    AddEdgesQueryNode,
    BasicType,
    BinaryOperationQueryNode,
    BinaryOperator,
    ConcatListsQueryNode,
    ConditionalQueryNode,
    CreateEntityQueryNode,
    DeleteEntitiesQueryNode,
    EdgeFilter,
    EdgeIdentifier, EntityFromIdQueryNode,
    FieldQueryNode,
    FirstOfListQueryNode,
    ListQueryNode,
    LiteralQueryNode,
    MergeObjectsQueryNode,
    NullQueryNode,
    ObjectQueryNode,
    PartialEdgeIdentifier, PreExecQueryParms,
    PropertySpecification,
    QueryNode,
    RemoveEdgesQueryNode,
    RootEntityIDQueryNode,
    SetEdgeQueryNode, AffectedFieldInfoQueryNode, SetFieldQueryNode,
    TransformListQueryNode,
    TypeCheckQueryNode,
    UnaryOperationQueryNode,
    UnaryOperator,
    UpdateEntitiesQueryNode,
    VariableAssignmentQueryNode,
    VariableQueryNode, WithPreExecutionQueryNode, EntitiesQueryNode
} from './definition';
import {
    ADD_CHILD_ENTITIES_FIELD_PREFIX,
    CALC_MUTATIONS_OPERATORS,
    CREATE_ENTITY_FIELD_PREFIX, DEFAULT_VALUE_DIRECTIVE, DELETE_ALL_ENTITIES_FIELD_PREFIX,
    DELETE_ENTITY_FIELD_PREFIX,
    ENTITY_CREATED_AT,
    ENTITY_UPDATED_AT,
    ID_FIELD,
    MUTATION_ID_ARG,
    MUTATION_INPUT_ARG,
    MutationType,
    NAMESPACE_FIELD_PATH_DIRECTIVE,
    REMOVE_CHILD_ENTITIES_FIELD_PREFIX, UPDATE_ALL_ENTITIES_FIELD_PREFIX,
    UPDATE_CHILD_ENTITIES_FIELD_PREFIX,
    UPDATE_ENTITY_FIELD_PREFIX, VALUE_ARG, WILDCARD_CHARACTER
} from '../schema/schema-defaults';
import { createEntityObjectNode, createTransformListQueryNode } from './queries';
import {
    findDirectiveWithName, getNodeByName,
    hasDirectiveWithName,
    isCalcMutationField,
    isChildEntityType,
    isEntityExtensionType,
    isRelationField,
    isRootEntityType,
    isTypeWithIdentity,
    isWriteProtectedSystemField
} from '../schema/schema-utils';
import {
    AnyValue, decapitalize, filterProperties, flatMap, mapValues, objectValues, PlainObject
} from '../utils/utils';
import {
    getAddChildEntityFieldName,
    getAddRelationFieldName,
    getRemoveChildEntityFieldName,
    getRemoveRelationFieldName,
    getUpdateChildEntityFieldName
} from '../graphql/names';
import {isListType} from '../graphql/schema-utils';
import { RelationFieldEdgeSide, EdgeType, getEdgeType } from '../schema/edges';
import uuid = require('uuid');
import {flattenValueNode} from "../schema/directive-arg-flattener";
import {globalContext} from "../config/global";
import { ErrorIfEmptyResultValidator, ErrorIfNotTruthyResultValidator, QueryResultValidator } from './query-result-validators';

/**
 * Creates a QueryNode for a field of the root mutation type
 * @param {FieldRequest} fieldRequest the mutation field, such as createSomeEntity
 * @param fieldRequestStack
 */
export function createMutationNamespaceNode(fieldRequest: FieldRequest, fieldRequestStack: FieldRequest[]): QueryNode {
    if (fieldRequest.fieldName.startsWith(CREATE_ENTITY_FIELD_PREFIX)) {
        return createCreateEntityQueryNode(fieldRequest, [...fieldRequestStack, fieldRequest]);
    }

    if (fieldRequest.fieldName.startsWith(UPDATE_ENTITY_FIELD_PREFIX) || fieldRequest.fieldName.startsWith(UPDATE_ALL_ENTITIES_FIELD_PREFIX)) {
        return createUpdateEntityQueryNode(fieldRequest, [...fieldRequestStack, fieldRequest]);
    }

    if (fieldRequest.fieldName.startsWith(DELETE_ENTITY_FIELD_PREFIX) || fieldRequest.fieldName.startsWith(DELETE_ALL_ENTITIES_FIELD_PREFIX)) {
        return createDeleteEntityQueryNode(fieldRequest, [...fieldRequestStack, fieldRequest]);
    }

    if (fieldRequest.field.type instanceof GraphQLObjectType && hasDirectiveWithName(fieldRequest.field.astNode as FieldDefinitionNode, NAMESPACE_FIELD_PATH_DIRECTIVE)) {
        return createMutationNamespaceFieldNode(fieldRequest, [...fieldRequestStack, fieldRequest])
    }

    globalContext.loggerProvider.getLogger('mutations').warn(`unknown field: ${fieldRequest.fieldName}`);
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
    const fieldCollector = new TypeFieldCollector();
    const objectNode = new LiteralQueryNode(prepareMutationInput(input, entityType, MutationType.CREATE, fieldCollector));

    // Create new entity
    const createEntityNode = new CreateEntityQueryNode(entityType, objectNode, fieldCollector.getFields());
    const newEntityIdVarNode = new VariableQueryNode('newEntityId');
    const newEntityPreExec = new PreExecQueryParms({query: createEntityNode, resultVariable: newEntityIdVarNode});

    // Add relations if needed
    let createRelationsPreExec: PreExecQueryParms|undefined = undefined;
    const relationStatements = getRelationAddRemoveStatements(input, entityType, newEntityIdVarNode, false);
    if (relationStatements.length) {
        createRelationsPreExec = new PreExecQueryParms({ query:
            new FirstOfListQueryNode(new ListQueryNode([new NullQueryNode(),...relationStatements]))});
    }

    // Build up result query node
    const newEntityVarNode = new VariableQueryNode('newEntity');
    const objectQueryNode = createEntityObjectNode(fieldRequest.selectionSet, newEntityVarNode, fieldRequestStack);
    const resultNode = new VariableAssignmentQueryNode({
        variableNode: newEntityVarNode,
        variableValueNode: new EntityFromIdQueryNode(entityType, newEntityIdVarNode),
        resultNode: objectQueryNode
    });

    // PreExecute creation and relation queries and return result
    return new WithPreExecutionQueryNode({
        resultNode,
        preExecQueries: [newEntityPreExec, createRelationsPreExec]
    });
}

class TypeFieldCollector {
    private map = new Map<GraphQLObjectType, Set<GraphQLField<any, any>>>();

    add(type: GraphQLObjectType, field: GraphQLField<any, any>) {
        const set = this.map.get(type);
        if (set) {
            set.add(field);
        } else {
            this.map.set(type, new Set([field]));
        }
    }

    getFields(): AffectedFieldInfoQueryNode[] {
        return flatMap(Array.from(this.map.entries()), ([type, fields]) => Array.from(fields).map(field => new AffectedFieldInfoQueryNode(type, field)));
    }
}

function prepareMutationInput(input: PlainObject, objectType: GraphQLObjectType, mutationType: MutationType, fieldCollector: TypeFieldCollector): PlainObject {

    let preparedInput: PlainObject = { ...input };

    // Apply default values from model
    // This is treated as user input, so the default
    // values are applied as the very first step.
    if (mutationType === MutationType.CREATE) {
        // add default values
        const defaultValues: any = {};
        for (const fieldKey in objectType.getFields()) {
            if (!getObjectTypeFieldOfInputKey(objectType, fieldKey)) {
                // there is no such field
                continue;
            }
            const defaultValueDirective = findDirectiveWithName(objectType.getFields()[fieldKey].astNode as FieldDefinitionNode, DEFAULT_VALUE_DIRECTIVE);
            if (defaultValueDirective == undefined || !defaultValueDirective.arguments || !getNodeByName(defaultValueDirective.arguments, VALUE_ARG)) {
                continue;
            }
            defaultValues[fieldKey] = flattenValueNode(getNodeByName(defaultValueDirective.arguments, VALUE_ARG)!.value);
        }
        preparedInput = {
            ...defaultValues,
            ...input
        }
    }

    if (isChildEntityType(objectType)) {
        preparedInput[ENTITY_UPDATED_AT] = getCurrentISODate();
        if (mutationType === MutationType.CREATE) {
            preparedInput[ID_FIELD] = uuid();
            preparedInput[ENTITY_CREATED_AT] = preparedInput[ENTITY_UPDATED_AT];
        }
    }

    if (isRootEntityType(objectType)) {
        if (mutationType === MutationType.CREATE) {
            // remove relation fields as they are treated by createCreateEntityQueryNode directly and should not be part
            // of the created object
            preparedInput = {
                ...filterProperties(preparedInput, (value, key) => {
                    const field = objectType.getFields()[key];
                    if (!field) {
                        throw new Error(`Field ${key} defined in input but does not exist on ${objectType.name}`);
                    }
                    return !isRelationField(field);
                }),
            };
            preparedInput[ENTITY_UPDATED_AT] = getCurrentISODate();
            preparedInput[ENTITY_CREATED_AT] = preparedInput[ENTITY_UPDATED_AT];

        } else {
            // We don't want to increment updatedAt if only relations are touched.
            if (inputSizeWithoutRelations(preparedInput, objectType) > 0) {
                 preparedInput[ENTITY_UPDATED_AT] = getCurrentISODate();
            }
        }
    }

    function inputSizeWithoutRelations(preparedInput: PlainObject, objectType: GraphQLObjectType): number {
        const keysLeft = new Set<string>();
        for (const key in preparedInput) {
            if (key === ID_FIELD) {
                // don't count id fields, they are always there.
                continue;
            }
            const field = getObjectTypeFieldOfInputKey(objectType, key);
            if (field && isRelationField(field)) {
                continue;
            }
            keysLeft.add(key);
        }
        return keysLeft.size;
    }

    function getObjectTypeFieldOfInputKey(objectType: GraphQLObjectType, key: string) {
        if (objectType.getFields()[key]) {
            return objectType.getFields()[key]
        } else {
            if (key.startsWith(ADD_CHILD_ENTITIES_FIELD_PREFIX)) {
                const descendantKey = decapitalize(key.substring(ADD_CHILD_ENTITIES_FIELD_PREFIX.length, key.length));
                if (objectType.getFields()[descendantKey]) {
                    return objectType.getFields()[descendantKey];
                }
            } else if (key.startsWith(REMOVE_CHILD_ENTITIES_FIELD_PREFIX)) {
                const descendantKey = decapitalize(key.substring(REMOVE_CHILD_ENTITIES_FIELD_PREFIX.length, key.length));
                if (objectType.getFields()[descendantKey]) {
                    return objectType.getFields()[descendantKey];
                }
            }
            return undefined;
        }
    }

    function prepareFieldValue(value: AnyValue, fieldType: GraphQLType, mutationType: MutationType): AnyValue {
        const rawType = getNamedType(fieldType);
        if (isListType(fieldType)) {
            return (value as AnyValue[]).map(itemValue => prepareFieldValue(itemValue, rawType, mutationType));
        }
        // Make sure to test value for being an object to not prepare "null" values or keys for reference fields (for which rawType would indeed be an object)
        if (typeof value == 'object' && value !== null && rawType instanceof GraphQLObjectType) {
            return prepareMutationInput(value as PlainObject, rawType, mutationType, fieldCollector);
        }
        // scalars can be used as-is
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
    return mapValues(preparedInput, (fieldValue, key) => {
        let objFields = objectType.getFields();
        const field = objFields[key];

        if (field) {
            fieldCollector.add(objectType, field);
            // only within entity extension, updates stay update-like. Within value objects, we fall back to create logic
            const fieldMutationType = isEntityExtensionType(getNamedType(field.type)) ? mutationType : MutationType.CREATE;
            return prepareFieldValue(fieldValue, objFields[key].type, fieldMutationType)
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
                    fieldCollector.add(objectType, objFields[withoutPrefix]);
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
    const mutationType: MutationType = fieldRequest.fieldName.startsWith(UPDATE_ALL_ENTITIES_FIELD_PREFIX) ?
        MutationType.UPDATE_ALL :
        MutationType.UPDATE;

    const entityType = getNamedType(fieldRequest.field.type);
    if (!entityType || !(entityType instanceof GraphQLObjectType)) {
        throw new Error(`Object type for field ${fieldRequest.fieldName} not found.`);
    }

    const fieldCollector = new TypeFieldCollector();
    const input = prepareMutationInput(fieldRequest.args[MUTATION_INPUT_ARG], entityType, mutationType, fieldCollector);

    // Update entity query
    let listNode: QueryNode;
    const listItemVar = new VariableQueryNode(decapitalize(entityType.name));
    const allEntitiesNode = new EntitiesQueryNode(entityType);
    if (mutationType === MutationType.UPDATE_ALL) {
        listNode = createTransformListQueryNode(fieldRequest, allEntitiesNode, listItemVar, listItemVar, fieldRequestStack);
    } else {
        const filterNode = new BinaryOperationQueryNode(new RootEntityIDQueryNode(listItemVar),
            BinaryOperator.EQUAL,
            new LiteralQueryNode(input[ID_FIELD]));
        listNode = new TransformListQueryNode({
            listNode: allEntitiesNode,
            filterNode: filterNode,
            maxCount: 1,
            itemVariable: listItemVar
        });
    }

    const currentEntityVarNode = new VariableQueryNode('currentEntity');
    const updateEntitiesNode = new UpdateEntitiesQueryNode({
        objectType: entityType,
        listNode,
        updates: createUpdatePropertiesSpecification(input, entityType, currentEntityVarNode),
        currentEntityVariable: currentEntityVarNode,
        affectedFields: fieldCollector.getFields()
    });

    const updatedEntitiesIDsVarNode = new VariableQueryNode('updatedEntitiesId');
    let updateEntityResultValidator: QueryResultValidator | undefined = undefined;
    if (mutationType === MutationType.UPDATE) {
        updateEntityResultValidator = new ErrorIfEmptyResultValidator(`${entityType.name} with id ${input[ID_FIELD]} could not be found.`, 'NotFoundError');
    }
    const updateEntitiesPreExec = new PreExecQueryParms({query: updateEntitiesNode, resultVariable: updatedEntitiesIDsVarNode, resultValidator: updateEntityResultValidator});

    // update relations if needed
    let updateRelationsPreExec: PreExecQueryParms|undefined = undefined;
    const updatedEntityIdVarNode1 = new VariableQueryNode('updatedEntityId1');
    const relationStatements = getRelationAddRemoveStatements(input, entityType, updatedEntityIdVarNode1, true);
    if (relationStatements.length) {
        const updateRelationsNode: QueryNode = new TransformListQueryNode({
            listNode: updatedEntitiesIDsVarNode,
            itemVariable: updatedEntityIdVarNode1,
            innerNode: new FirstOfListQueryNode(new ListQueryNode([new NullQueryNode(), ...relationStatements]))
        });
        updateRelationsPreExec = new PreExecQueryParms({ query: new FirstOfListQueryNode(updateRelationsNode) });
    }

    // Build up result query node
    const updatedEntityIdVarNode2 = new VariableQueryNode('updatedEntityId2');
    let resultNode: QueryNode = new TransformListQueryNode({
        listNode: updatedEntitiesIDsVarNode,
        itemVariable: updatedEntityIdVarNode2,
        innerNode: createEntityObjectNode(
            fieldRequest.selectionSet,
            new EntityFromIdQueryNode(entityType, updatedEntityIdVarNode2),
            fieldRequestStack)
    });

    if (mutationType === MutationType.UPDATE) {
        resultNode = new FirstOfListQueryNode(resultNode);
    }

    // PreExecute update and relation queries and return result
    return new WithPreExecutionQueryNode({
        resultNode,
        preExecQueries: [updateEntitiesPreExec, updateRelationsPreExec]
    });
}

function getRelationAddRemoveStatements(obj: PlainObject, parentType: GraphQLObjectType, sourceIDNode: QueryNode, isAddRemove: boolean): QueryNode[] {
    // note: we don't check if the target ids exists. This would be a constraint that will be checked in Foxx once we
    // implement Foxx. It's not easy to do this in AQL because we can't throw errors in AQL.

    const relationFields = objectValues(parentType.getFields()).filter(field => isRelationField(field));
    const statements: QueryNode[] = [];
    for (const field of relationFields) {
        const edgeType = getEdgeType(parentType, field);
        if (isListType(field.type)) {
            // to-n relation
            const idsToBeAdded = (isAddRemove ? obj[getAddRelationFieldName(field.name)] : obj[field.name]) as string[] | undefined || [];
            const idsToBeRemoved = isAddRemove ? (obj[getRemoveRelationFieldName(field.name)] || []) as string[] : [];
            if (idsToBeAdded.length && idsToBeRemoved.length) {
                throw new Error(`Currently, it is not possible to use add and remove on the same relation in one mutation`);
            }

            if (idsToBeAdded.length) {
                const edgeNodes = idsToBeAdded.map(id => getEdgeIdentifier({
                    edgeType,
                    sourceIDNode,
                    targetIDNode: new LiteralQueryNode(id),
                    sourceType: parentType,
                    sourceField: field
                }));
                statements.push(new AddEdgesQueryNode(edgeType, edgeNodes));
            } else if (idsToBeRemoved.length) {
                let targetIds;
                if(idsToBeRemoved.includes(WILDCARD_CHARACTER)) {
                    // target IDs undefined => no target ID filter => remove all edges from source ignoring target
                    targetIds = undefined;
                }else {
                    targetIds = idsToBeRemoved.map(id => new LiteralQueryNode(id));
                }

                statements.push(new RemoveEdgesQueryNode(edgeType, getEdgeFilter({
                    edgeType,
                    sourceType: parentType,
                    sourceIDNodes: [sourceIDNode],
                    targetIDNodes: targetIds,
                    sourceField: field
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
                        sourceIDNode,
                        sourceField: field
                    }),
                    newEdge: getEdgeIdentifier({
                        edgeType,
                        sourceType: parentType,
                        sourceIDNode,
                        targetIDNode: new LiteralQueryNode(newID),
                        sourceField: field
                    })
                }));
            } else {
                // remove relation
                statements.push(new RemoveEdgesQueryNode(
                    edgeType,
                    getEdgeFilter({
                        edgeType,
                        sourceType: parentType,
                        sourceIDNodes: [sourceIDNode],
                        sourceField: field
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
function getEdgeIdentifier(param: { edgeType: EdgeType; sourceIDNode: QueryNode; targetIDNode: QueryNode; sourceType: GraphQLObjectType, sourceField: GraphQLField<any, any> }): EdgeIdentifier {
    switch (param.edgeType.getRelationFieldEdgeSide(param.sourceField)) {
        case RelationFieldEdgeSide.FROM_SIDE:
            return new EdgeIdentifier(param.sourceIDNode, param.targetIDNode);
        case RelationFieldEdgeSide.TO_SIDE:
            return new EdgeIdentifier(param.targetIDNode, param.sourceIDNode);
    }
}

/**
 * Creates a partial edge identifier of the format ?->id or id->?
 */
function getPartialEdgeIdentifier(param: { edgeType: EdgeType; sourceIDNode: QueryNode; sourceType: GraphQLObjectType, sourceField: GraphQLField<any, any> }): PartialEdgeIdentifier {
    switch (param.edgeType.getRelationFieldEdgeSide(param.sourceField)) {
        case RelationFieldEdgeSide.FROM_SIDE:
            return new PartialEdgeIdentifier(param.sourceIDNode, undefined);
        case RelationFieldEdgeSide.TO_SIDE:
            return new PartialEdgeIdentifier(undefined, param.sourceIDNode);
    }
}

/**
 * Creates an Edge filter. Reorders source/target so that they match from/to in the edgeType
 */
function getEdgeFilter(param: { edgeType: EdgeType; sourceIDNodes?: QueryNode[]; targetIDNodes?: QueryNode[]; sourceType: GraphQLObjectType, sourceField: GraphQLField<any, any> }): EdgeFilter {
    switch (param.edgeType.getRelationFieldEdgeSide(param.sourceField)) {
        case RelationFieldEdgeSide.FROM_SIDE:
            return new EdgeFilter(param.sourceIDNodes, param.targetIDNodes);
        case RelationFieldEdgeSide.TO_SIDE:
            return new EdgeFilter(param.targetIDNodes, param.sourceIDNodes);
    }
}

function getCurrentISODate() {
    return new Date().toISOString();
}

function createUpdatePropertiesSpecification(obj: any, objectType: GraphQLObjectType, oldEntityNode: QueryNode): SetFieldQueryNode[] {
    if (typeof obj != 'object') {
        return [];
    }

    const properties: SetFieldQueryNode[] = [];
    for (const field of objectValues(objectType.getFields())) {
        if (isEntityExtensionType(getNamedType(field.type)) && field.name in obj) {
            // call recursively and use update semantic (leave fields that are not specified as-is
            const sourceNode = new FieldQueryNode(oldEntityNode, field, objectType);
            const valueNode = new MergeObjectsQueryNode([
                createSafeObjectQueryNode(sourceNode),
                new ObjectQueryNode(createUpdatePropertiesSpecification(obj[field.name], getNamedType(field.type) as GraphQLObjectType, sourceNode))
            ]);
            properties.push(new SetFieldQueryNode(field, objectType, valueNode));
        } else if (isChildEntityType(getNamedType(field.type))) {
            const childEntityType = getNamedType(field.type) as GraphQLObjectType;
            const idField = childEntityType.getFields()[ID_FIELD];

            // first add, then delete, then update
            // -> delete trumps add
            // -> new values can be updated
            // -> update operates on reduced list (delete ones do not generate overhead)
            // generates a query like this:
            // FOR obj IN [...existing, ...newValues] FILTER !(obj.id IN removedIDs) RETURN obj.id == updateID ? update(obj) : obj
            const rawExistingNode = new FieldQueryNode(oldEntityNode, field, objectType);
            let currentNode: QueryNode = new ConditionalQueryNode( // fall back to empty list if property is not a list
                new TypeCheckQueryNode(rawExistingNode, BasicType.LIST), rawExistingNode, new ListQueryNode([]));

            const newValues: any[] | undefined = obj[getAddChildEntityFieldName(field.name)];
            if (newValues) {
                // newValues is already prepared, just like everything passed to this function, so uuids are already there
                // wrap the whole thing into a LiteralQueryNode instead of them individually so that only one bound variable is used
                const newNode = new LiteralQueryNode(newValues);
                currentNode = new ConcatListsQueryNode([currentNode, newNode]);
            }

            const childEntityVarNode = new VariableQueryNode(decapitalize(childEntityType.name));
            const childIDQueryNode = new FieldQueryNode(childEntityVarNode, idField, objectType);

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
                        createSafeObjectQueryNode(childEntityVarNode),
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

            properties.push(new SetFieldQueryNode(field, objectType, currentNode));
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
                        // TODO ArangoDB implicitly converts null to 0 during arithmetic operations. Is this ok?
                        valueNode = new BinaryOperationQueryNode(
                            valueNode || new FieldQueryNode(oldEntityNode, field, objectType),
                            binaryOperator,
                            new LiteralQueryNode(obj[inputCalcFieldName]))
                    }
                }
            }

            if(valueNode) {
                properties.push(new SetFieldQueryNode(field, objectType, valueNode));
            }
        }
    }

    // if any property has been updated on an entity, set its update timestamp
    if (properties.length && isTypeWithIdentity(objectType)) {
        const field = objectType.getFields()[ENTITY_UPDATED_AT];
        properties.push(new SetFieldQueryNode(field, objectType, new LiteralQueryNode(getCurrentISODate())));
    }

    return properties;
}

function createDeleteEntityQueryNode(fieldRequest: FieldRequest, fieldRequestStack: FieldRequest[]): QueryNode {
    const mutationType: MutationType = fieldRequest.fieldName.startsWith(DELETE_ALL_ENTITIES_FIELD_PREFIX) ?
        MutationType.DELETE_ALL :
        MutationType.DELETE;

    const entityType = getNamedType(fieldRequest.field.type);
    if (!entityType || !(entityType instanceof GraphQLObjectType)) {
        throw new Error(`Object type for field ${fieldRequest.fieldName} not found.`);
    }

    // Delete entity query
    let listNode: QueryNode;
    const listItemVar = new VariableQueryNode(decapitalize(entityType.name));
    const allEntitiesNode = new EntitiesQueryNode(entityType);
    if (mutationType === MutationType.DELETE_ALL) {
        listNode = createTransformListQueryNode(fieldRequest, allEntitiesNode, listItemVar, listItemVar, fieldRequestStack);
    } else {
        const filterNode = new BinaryOperationQueryNode(new RootEntityIDQueryNode(listItemVar),
            BinaryOperator.EQUAL,
            new LiteralQueryNode(fieldRequest.args[MUTATION_ID_ARG]));
        listNode = new TransformListQueryNode({
            listNode: allEntitiesNode,
            filterNode: filterNode,
            maxCount: 1,
            itemVariable: listItemVar
        });
    }

    const currentEntityVarNode = new VariableQueryNode('currentEntity');
    const deleteEntitiesNode = new DeleteEntitiesQueryNode({
        objectType: entityType,
        listNode,
        currentEntityVariable: currentEntityVarNode
    });

    // Build up result query node
    const deletedEntityVarNode = new VariableQueryNode('deletedEntity');
    let resultNode: QueryNode = new TransformListQueryNode({
        listNode: deleteEntitiesNode,
        itemVariable: deletedEntityVarNode,
        innerNode: createEntityObjectNode(
            fieldRequest.selectionSet,
            deletedEntityVarNode,
            fieldRequestStack)
    });

    if (mutationType === MutationType.DELETE) {
        resultNode = new FirstOfListQueryNode(resultNode);
    }

    return resultNode;
}

export function createSafeObjectQueryNode(objectNode: QueryNode) {
    return new ConditionalQueryNode(
        new TypeCheckQueryNode(objectNode, BasicType.OBJECT),
        objectNode,
        new ObjectQueryNode([])
    );
}

