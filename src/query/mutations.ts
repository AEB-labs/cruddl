import { getNamedType } from 'graphql';
import {
    getAddChildEntitiesFieldName, getAddRelationFieldName, getRemoveChildEntitiesFieldName, getRemoveRelationFieldName,
    getUpdateChildEntitiesFieldName
} from '../graphql/names';
import { FieldRequest } from '../graphql/query-distiller';
import {
    CalcMutationsOperator, Field, Namespace, ObjectType, Relation, RelationFieldSide, RootEntityType
} from '../model';
import {
    AddEdgesQueryNode, AffectedFieldInfoQueryNode, BasicType, BinaryOperationQueryNode, BinaryOperator,
    ConcatListsQueryNode, ConditionalQueryNode, CreateEntityQueryNode, DeleteEntitiesQueryNode, EdgeFilter,
    EdgeIdentifier, EntitiesQueryNode, EntityFromIdQueryNode, ErrorIfEmptyResultValidator, FieldQueryNode,
    FirstOfListQueryNode, ListQueryNode, LiteralQueryNode, MergeObjectsQueryNode, NullQueryNode, ObjectQueryNode,
    PartialEdgeIdentifier, PreExecQueryParms, PropertySpecification, QueryNode, QueryResultValidator,
    RemoveEdgesQueryNode, RootEntityIDQueryNode, SetEdgeQueryNode, SetFieldQueryNode, TransformListQueryNode,
    TypeCheckQueryNode, UnaryOperationQueryNode, UnaryOperator, UpdateEntitiesQueryNode, VariableAssignmentQueryNode,
    VariableQueryNode, WithPreExecutionQueryNode
} from '../query-tree';
import {
    ADD_CHILD_ENTITIES_FIELD_PREFIX, CALC_MUTATIONS_OPERATORS, CREATE_ENTITY_FIELD_PREFIX,
    DELETE_ALL_ENTITIES_FIELD_PREFIX, DELETE_ENTITY_FIELD_PREFIX, ENTITY_CREATED_AT, ENTITY_UPDATED_AT, ID_FIELD,
    MUTATION_ID_ARG, MUTATION_INPUT_ARG, MutationType, REMOVE_CHILD_ENTITIES_FIELD_PREFIX,
    UPDATE_ALL_ENTITIES_FIELD_PREFIX, UPDATE_CHILD_ENTITIES_FIELD_PREFIX, UPDATE_ENTITY_FIELD_PREFIX, WILDCARD_CHARACTER
} from '../schema/schema-defaults';
import { AnyValue, decapitalize, filterProperties, mapValues, PlainObject } from '../utils/utils';
import { createEntityObjectNode, createTransformListQueryNode } from './queries';
import uuid = require('uuid');

/**
 * Creates a QueryNode for a field of the root mutation type
 * @param {FieldRequest} fieldRequest the mutation field, such as createSomeEntity
 * @param fieldRequestStack
 */
export function createMutationNamespaceNode(fieldRequest: FieldRequest, fieldRequestStack: FieldRequest[], namespace: Namespace): QueryNode {
    if (fieldRequest.fieldName.startsWith(CREATE_ENTITY_FIELD_PREFIX)) {
        return createCreateEntityQueryNode(fieldRequest, [...fieldRequestStack, fieldRequest], namespace.getRootEntityTypeOrThrow(getNamedType(fieldRequest.field.type).name));
    }

    if (fieldRequest.fieldName.startsWith(UPDATE_ENTITY_FIELD_PREFIX) || fieldRequest.fieldName.startsWith(UPDATE_ALL_ENTITIES_FIELD_PREFIX)) {
        return createUpdateEntityQueryNode(fieldRequest, [...fieldRequestStack, fieldRequest], namespace.getRootEntityTypeOrThrow(getNamedType(fieldRequest.field.type).name));
    }

    if (fieldRequest.fieldName.startsWith(DELETE_ENTITY_FIELD_PREFIX) || fieldRequest.fieldName.startsWith(DELETE_ALL_ENTITIES_FIELD_PREFIX)) {
        return createDeleteEntityQueryNode(fieldRequest, [...fieldRequestStack, fieldRequest], namespace.getRootEntityTypeOrThrow(getNamedType(fieldRequest.field.type).name));
    }

    const childNamespace = namespace.getChildNamespace(fieldRequest.fieldName);
    if (childNamespace) {
        return createMutationNamespaceFieldNode(fieldRequest, [...fieldRequestStack, fieldRequest], childNamespace);
    }

    throw new Error(`Mutation field "${fieldRequest.fieldName}" is not known in namespace "${namespace.dotSeparatedPath}"`);
}

function createMutationNamespaceFieldNode(fieldRequest: FieldRequest, fieldRequestStack: FieldRequest[], namespace: Namespace): QueryNode {
    return new ObjectQueryNode(fieldRequest.selectionSet.map(
        sel => new PropertySpecification(sel.propertyName,
            // a namespace can be interpreted as pushing the root node down.
            createMutationNamespaceNode(sel.fieldRequest, fieldRequestStack, namespace))));
}

function createCreateEntityQueryNode(fieldRequest: FieldRequest, fieldRequestStack: FieldRequest[], rootEntityType: RootEntityType): QueryNode {
    const input = fieldRequest.args[MUTATION_INPUT_ARG];
    const fieldCollector = new Set<Field>();
    const objectNode = new LiteralQueryNode(prepareMutationInput(input, rootEntityType, MutationType.CREATE, fieldCollector));

    // Create new entity
    const createEntityNode = new CreateEntityQueryNode(rootEntityType, objectNode,
        Array.from(fieldCollector.values()).map(field => new AffectedFieldInfoQueryNode(field)));
    const newEntityIdVarNode = new VariableQueryNode('newEntityId');
    const newEntityPreExec = new PreExecQueryParms({query: createEntityNode, resultVariable: newEntityIdVarNode});

    // Add relations if needed
    let createRelationsPreExec: PreExecQueryParms|undefined = undefined;
    const relationStatements = getRelationAddRemoveStatements(input, rootEntityType, newEntityIdVarNode, false);
    if (relationStatements.length) {
        createRelationsPreExec = new PreExecQueryParms({ query:
            new FirstOfListQueryNode(new ListQueryNode([new NullQueryNode(),...relationStatements]))});
    }

    // Build up result query node
    const newEntityVarNode = new VariableQueryNode('newEntity');
    const objectQueryNode = createEntityObjectNode(fieldRequest.selectionSet, newEntityVarNode, rootEntityType, fieldRequestStack);
    const resultNode = new VariableAssignmentQueryNode({
        variableNode: newEntityVarNode,
        variableValueNode: new EntityFromIdQueryNode(rootEntityType, newEntityIdVarNode),
        resultNode: objectQueryNode
    });

    // PreExecute creation and relation queries and return result
    return new WithPreExecutionQueryNode({
        resultNode,
        preExecQueries: [newEntityPreExec, createRelationsPreExec]
    });
}

export function prepareMutationInput(input: PlainObject, objectType: ObjectType, mutationType: MutationType, fieldCollector: Set<Field>): PlainObject {

    let preparedInput: PlainObject = { ...input };

    // Apply default values from model
    // This is treated as user input, so the default
    // values are applied as the very first step.
    if (mutationType === MutationType.CREATE) {
        // add default values
        const defaultValues: any = {};
        for (const field of objectType.fields) {
            if (field.defaultValue !== undefined) {
                defaultValues[field.name] = field.defaultValue;
            }
        }
        preparedInput = {
            ...defaultValues,
            ...input
        }
    }

    const now = getCurrentISODate();

    if (objectType.isChildEntityType) {
        preparedInput = {
            ...preparedInput,
            [ENTITY_UPDATED_AT]: now
        };
        if (mutationType === MutationType.CREATE) {
            preparedInput = {
                ...preparedInput,
                [ENTITY_CREATED_AT]: now,
                [ID_FIELD]: uuid()
            };
        }
    }

    if (objectType.isRootEntityType) {
        if (mutationType === MutationType.CREATE) {
            // remove relation fields as they are treated by createCreateEntityQueryNode directly and should not be part
            // of the created object
            preparedInput = {
                ...filterProperties(preparedInput, (value, key) => !objectType.getFieldOrThrow(key).isRelation),
                [ENTITY_CREATED_AT]: now,
                [ENTITY_UPDATED_AT]: now
            };
        } else {
            // We don't want to increment updatedAt if only relations are touched.
            if (inputIncludesValueFields(preparedInput, objectType)) {
                preparedInput = {
                    ...preparedInput,
                    [ENTITY_UPDATED_AT]: now
                };
            }
        }
    }

    function isValueField(field: Field|undefined): boolean {
        if (!field) {
            // fail safe, e.g. for calcMutations or add/update/delete
            return true;
        }
        // system: createdAt/updatedAt/id - those are not specified by the user
        // relation: those do not affect the root entity
        if (field.isSystemField || field.isRelation) {
            return false;
        }
        // regular field
        return true;
    }

    /**
     * Checks whether the input object defines fields that alter the root entity's value
     */
    function inputIncludesValueFields(preparedInput: PlainObject, objectType: RootEntityType): boolean {
        return Object
            .keys(preparedInput)
            .map(key => objectType.getField(key))
            .filter(isValueField)
            .length > 0;
    }

    function getObjectTypeFieldOfInputKey(objectType: ObjectType, key: string): Field|undefined {
        const field = objectType.getField(key);
        if (field) {
            return field;
        }

        if (key.startsWith(ADD_CHILD_ENTITIES_FIELD_PREFIX)) {
            const descendantKey = decapitalize(key.substring(ADD_CHILD_ENTITIES_FIELD_PREFIX.length, key.length));
            return objectType.getField(descendantKey);
        } else if (key.startsWith(REMOVE_CHILD_ENTITIES_FIELD_PREFIX)) {
            const descendantKey = decapitalize(key.substring(REMOVE_CHILD_ENTITIES_FIELD_PREFIX.length, key.length));
            return objectType.getField(descendantKey);
        }
        return undefined;
    }

    function prepareFieldValue(value: AnyValue, field: Field, mutationType: MutationType, withinList: boolean = false): AnyValue {
        if (field.isList && !withinList) {
            return (value as AnyValue[]).map(itemValue => prepareFieldValue(itemValue, field, mutationType, true));
        }
        // Make sure to test value for being an object to not prepare "null" values or keys for reference fields (for which rawType would indeed be an object)
        if (typeof value == 'object' && value !== null && field.type.isObjectType) {
            return prepareMutationInput(value as PlainObject, field.type, mutationType, fieldCollector);
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
        const field = objectType.getField(key);

        if (field) {
            fieldCollector.add(field);
            // only within entity extension, updates stay update-like. Within value objects, we fall back to create logic
            const fieldMutationType = field.type.isEntityExtensionType ? mutationType : MutationType.CREATE;
            return prepareFieldValue(fieldValue, field, fieldMutationType)
        } else {
            // must be a (gnerated) special input field
            const possiblePrefixes: string[] = [
                ADD_CHILD_ENTITIES_FIELD_PREFIX,
                UPDATE_CHILD_ENTITIES_FIELD_PREFIX,
                REMOVE_CHILD_ENTITIES_FIELD_PREFIX,
                ...CALC_MUTATIONS_OPERATORS.map(op => op.prefix)];
            for (const prefix of possiblePrefixes) {
                let withoutPrefix = keyWithoutPrefix(key, prefix);
                if(withoutPrefix) {
                    const field = objectType.getField(withoutPrefix);
                    if (field) {
                        fieldCollector.add(field);
                        switch(prefix) {
                            case ADD_CHILD_ENTITIES_FIELD_PREFIX: {
                                // oh, adding child entities is create, not update!
                                // btw, once create => always create!
                                return prepareFieldValue(fieldValue, field, MutationType.CREATE)
                            }
                            case UPDATE_CHILD_ENTITIES_FIELD_PREFIX: {
                                return prepareFieldValue(fieldValue, field, mutationType)
                            }
                            default: {
                                // the remaining special input fields do not need further treatment.
                                // e.g. REMOVE_CHILD_ENTITIES_FIELD_PREFIX, CALC_MUTATIONS_OPERATORS
                                return fieldValue;
                            }
                        }
                    }
                }
            }
            throw new Error(`Mutation input field named "${key}" does neither match to a plain object field, nor to a known special input field pattern.`);
        }
    });
}

function createUpdateEntityQueryNode(fieldRequest: FieldRequest, fieldRequestStack: FieldRequest[], rootEntityType: RootEntityType): QueryNode {
    const mutationType: MutationType = fieldRequest.fieldName.startsWith(UPDATE_ALL_ENTITIES_FIELD_PREFIX) ?
        MutationType.UPDATE_ALL :
        MutationType.UPDATE;

    const fieldCollector = new Set<Field>();
    const input = prepareMutationInput(fieldRequest.args[MUTATION_INPUT_ARG], rootEntityType, mutationType, fieldCollector);

    // Update entity query
    let listNode: QueryNode;
    const listItemVar = new VariableQueryNode(decapitalize(rootEntityType.name));
    const allEntitiesNode = new EntitiesQueryNode(rootEntityType);
    if (mutationType === MutationType.UPDATE_ALL) {
        listNode = createTransformListQueryNode(fieldRequest, allEntitiesNode, listItemVar, listItemVar, rootEntityType, fieldRequestStack);
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
        rootEntityType: rootEntityType,
        listNode,
        updates: createUpdatePropertiesSpecification(input, rootEntityType, currentEntityVarNode),
        currentEntityVariable: currentEntityVarNode,
        affectedFields: Array.from(fieldCollector.values()).map(field => new AffectedFieldInfoQueryNode(field))
    });

    const updatedEntitiesIDsVarNode = new VariableQueryNode('updatedEntitiesId');
    let updateEntityResultValidator: QueryResultValidator | undefined = undefined;
    if (mutationType === MutationType.UPDATE) {
        updateEntityResultValidator = new ErrorIfEmptyResultValidator(`${rootEntityType.name} with id ${input[ID_FIELD]} could not be found.`, 'NotFoundError');
    }
    const updateEntitiesPreExec = new PreExecQueryParms({query: updateEntitiesNode, resultVariable: updatedEntitiesIDsVarNode, resultValidator: updateEntityResultValidator});

    // update relations if needed
    let updateRelationsPreExec: PreExecQueryParms|undefined = undefined;
    const updatedEntityIdVarNode1 = new VariableQueryNode('updatedEntityId1');
    const relationStatements = getRelationAddRemoveStatements(input, rootEntityType, updatedEntityIdVarNode1, true);
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
            new EntityFromIdQueryNode(rootEntityType, updatedEntityIdVarNode2),
            rootEntityType,
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

export function getRelationAddRemoveStatements(obj: PlainObject, parentType: ObjectType, sourceIDNode: QueryNode, isAddRemove: boolean): QueryNode[] {
    // note: we don't check if the target ids exists. This would be a constraint that will be checked in Foxx once we
    // implement Foxx. It's not easy to do this in AQL because we can't throw errors in AQL.

    const relationFields = parentType.fields.filter(f => f.isRelation);
    const statements: QueryNode[] = [];
    for (const field of relationFields) {
        const relation = field.getRelationOrThrow();
        if (field.isList) {
            // to-n relation
            const idsToBeAdded = (isAddRemove ? obj[getAddRelationFieldName(field.name)] : obj[field.name]) as string[] | undefined || [];
            const idsToBeRemoved = isAddRemove ? (obj[getRemoveRelationFieldName(field.name)] || []) as string[] : [];
            if (idsToBeAdded.length && idsToBeRemoved.length) {
                throw new Error(`Currently, it is not possible to use add and remove on the same relation in one mutation`);
            }

            if (idsToBeAdded.length) {
                const edgeNodes = idsToBeAdded.map(id => getEdgeIdentifier({
                    relation,
                    sourceIDNode,
                    targetIDNode: new LiteralQueryNode(id),
                    sourceField: field
                }));
                statements.push(new AddEdgesQueryNode(relation, edgeNodes));
            } else if (idsToBeRemoved.length) {
                let targetIds;
                if(idsToBeRemoved.includes(WILDCARD_CHARACTER)) {
                    // target IDs undefined => no target ID filter => remove all edges from source ignoring target
                    targetIds = undefined;
                }else {
                    targetIds = idsToBeRemoved.map(id => new LiteralQueryNode(id));
                }

                statements.push(new RemoveEdgesQueryNode(relation, getEdgeFilter({
                    relation,
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
                    relation: relation,
                    existingEdge: getPartialEdgeIdentifier({
                        relation,
                        sourceIDNode,
                        sourceField: field
                    }),
                    newEdge: getEdgeIdentifier({
                        relation,
                        sourceIDNode,
                        targetIDNode: new LiteralQueryNode(newID),
                        sourceField: field
                    })
                }));
            } else {
                // remove relation
                statements.push(new RemoveEdgesQueryNode(
                    relation,
                    getEdgeFilter({
                        relation,
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
 * Creates an Edge identifier. Reorders source/target so that they match from/to in the relation
 */
function getEdgeIdentifier(param: { relation: Relation; sourceIDNode: QueryNode; targetIDNode: QueryNode; sourceField: Field }): EdgeIdentifier {
    switch (param.relation.getFieldSide(param.sourceField)) {
        case RelationFieldSide.FROM_SIDE:
            return new EdgeIdentifier(param.sourceIDNode, param.targetIDNode);
        case RelationFieldSide.TO_SIDE:
            return new EdgeIdentifier(param.targetIDNode, param.sourceIDNode);
    }
}

/**
 * Creates a partial edge identifier of the format ?->id or id->?
 */
function getPartialEdgeIdentifier(param: { relation: Relation; sourceIDNode: QueryNode; sourceField: Field }): PartialEdgeIdentifier {
    switch (param.relation.getFieldSide(param.sourceField)) {
        case RelationFieldSide.FROM_SIDE:
            return new PartialEdgeIdentifier(param.sourceIDNode, undefined);
        case RelationFieldSide.TO_SIDE:
            return new PartialEdgeIdentifier(undefined, param.sourceIDNode);
    }
}

/**
 * Creates an Edge filter. Reorders source/target so that they match from/to in the relation
 */
function getEdgeFilter(param: { relation: Relation; sourceIDNodes?: QueryNode[]; targetIDNodes?: QueryNode[]; sourceField: Field }): EdgeFilter {
    switch (param.relation.getFieldSide(param.sourceField)) {
        case RelationFieldSide.FROM_SIDE:
            return new EdgeFilter(param.sourceIDNodes, param.targetIDNodes);
        case RelationFieldSide.TO_SIDE:
            return new EdgeFilter(param.targetIDNodes, param.sourceIDNodes);
    }
}

function getCurrentISODate() {
    return new Date().toISOString();
}

function createUpdatePropertiesSpecification(obj: any, objectType: ObjectType, oldEntityNode: QueryNode): SetFieldQueryNode[] {
    if (typeof obj != 'object') {
        return [];
    }

    const properties: SetFieldQueryNode[] = [];
    for (const field of objectType.fields) {
        if (field.type.isEntityExtensionType && field.name in obj) {
            // call recursively and use update semantic (leave fields that are not specified as-is
            const sourceNode = new FieldQueryNode(oldEntityNode, field);
            const valueNode = new MergeObjectsQueryNode([
                createSafeObjectQueryNode(sourceNode),
                new ObjectQueryNode(createUpdatePropertiesSpecification(obj[field.name], field.type, sourceNode))
            ]);
            properties.push(new SetFieldQueryNode(field, valueNode));
        } else if (field.type.isChildEntityType) {
            const childEntityType = field.type;
            const idField = childEntityType.getFieldOrThrow(ID_FIELD);

            // first add, then delete, then update
            // -> delete trumps add
            // -> new values can be updated
            // -> update operates on reduced list (delete ones do not generate overhead)
            // generates a query like this:
            // FOR obj IN [...existing, ...newValues] FILTER !(obj.id IN removedIDs) RETURN obj.id == updateID ? update(obj) : obj
            const rawExistingNode = new FieldQueryNode(oldEntityNode, field);
            let currentNode: QueryNode = new ConditionalQueryNode( // fall back to empty list if property is not a list
                new TypeCheckQueryNode(rawExistingNode, BasicType.LIST), rawExistingNode, new ListQueryNode([]));

            const newValues: any[] | undefined = obj[getAddChildEntitiesFieldName(field.name)];
            if (newValues) {
                // newValues is already prepared, just like everything passed to this function, so uuids are already there
                // wrap the whole thing into a LiteralQueryNode instead of them individually so that only one bound variable is used
                const newNode = new LiteralQueryNode(newValues);
                currentNode = new ConcatListsQueryNode([currentNode, newNode]);
            }

            const childEntityVarNode = new VariableQueryNode(decapitalize(childEntityType.name));
            const childIDQueryNode = new FieldQueryNode(childEntityVarNode, idField);

            const removedIDs: number[] | undefined = obj[getRemoveChildEntitiesFieldName(field.name)];
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

            const updatedValues: any[] | undefined = obj[getUpdateChildEntitiesFieldName(field.name)];
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

            properties.push(new SetFieldQueryNode(field, currentNode));
        } else if (field.isRelation) {
            // do nothing because relations are not represented in the update property specification, they are
            // considered by createUpdateEntityQueryNode directly
        } else if (field.isReadOnly) {
            // this field must not be updated (may exist in schema for other purposes like filtering for an entity)
        } else  {
            // scalars and value objects
            let valueNode: QueryNode | undefined = undefined;
            if (field.name in obj) {
                valueNode = new LiteralQueryNode(obj[field.name]);
            }

            // note: the loop order defines the application order of the operators so it is significant
            for (const operator of CALC_MUTATIONS_OPERATORS) {
                if (!(field.calcMutationOperators.has(operator.name as CalcMutationsOperator))) {
                    continue;
                }
                const inputCalcFieldName = operator.prefix + field.name;
                const binaryOperator: BinaryOperator = BinaryOperator[operator.name];
                if(!(inputCalcFieldName in obj)) {
                    continue;
                }

                // TODO ArangoDB implicitly converts null to 0 during arithmetic operations. Is this ok?
                valueNode = new BinaryOperationQueryNode(
                    valueNode || new FieldQueryNode(oldEntityNode, field),
                    binaryOperator,
                    new LiteralQueryNode(obj[inputCalcFieldName])
                );
            }

            if(valueNode) {
                properties.push(new SetFieldQueryNode(field, valueNode));
            }
        }
    }

    // if any property has been updated on an entity, set its update timestamp
    if (properties.length && (objectType.isChildEntityType || objectType.isRootEntityType)) {
        const field = objectType.getFieldOrThrow(ENTITY_UPDATED_AT);
        properties.push(new SetFieldQueryNode(field, new LiteralQueryNode(getCurrentISODate())));
    }

    return properties;
}

function createDeleteEntityQueryNode(fieldRequest: FieldRequest, fieldRequestStack: FieldRequest[], rootEntityType: RootEntityType): QueryNode {
    const mutationType: MutationType = fieldRequest.fieldName.startsWith(DELETE_ALL_ENTITIES_FIELD_PREFIX) ?
        MutationType.DELETE_ALL :
        MutationType.DELETE;

    // Delete entity query
    let listNode: QueryNode;
    const listItemVar = new VariableQueryNode(decapitalize(rootEntityType.name));
    const allEntitiesNode = new EntitiesQueryNode(rootEntityType);
    if (mutationType === MutationType.DELETE_ALL) {
        listNode = createTransformListQueryNode(fieldRequest, allEntitiesNode, listItemVar, listItemVar, rootEntityType, fieldRequestStack);
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

    const deleteEntitiesNode = new DeleteEntitiesQueryNode({
        rootEntityType: rootEntityType,
        listNode
    });

    // Build up result query node
    const deletedEntityVarNode = new VariableQueryNode('deletedEntity');
    let resultNode: QueryNode = new TransformListQueryNode({
        listNode: deleteEntitiesNode,
        itemVariable: deletedEntityVarNode,
        innerNode: createEntityObjectNode(
            fieldRequest.selectionSet,
            deletedEntityVarNode,
            rootEntityType,
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

