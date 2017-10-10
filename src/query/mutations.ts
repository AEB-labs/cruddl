import { FieldRequest } from '../graphql/query-distiller';
import { getNamedType, GraphQLObjectType } from 'graphql';
import {
    BasicType, BinaryOperationQueryNode, BinaryOperator, ConcatListsQueryNode, ConditionalQueryNode,
    CreateEntityQueryNode, DeleteEntitiesQueryNode, FieldQueryNode, FirstOfListQueryNode, ListQueryNode,
    LiteralQueryNode, MergeObjectsQueryNode, NullQueryNode, ObjectQueryNode, PropertySpecification, QueryNode,
    TransformListQueryNode,
    TypeCheckQueryNode, UnaryOperationQueryNode, UnaryOperator, UpdateEntitiesQueryNode, VariableAssignmentQueryNode,
    VariableQueryNode
} from './definition';
import {
    CREATE_ENTITY_FIELD_PREFIX, DELETE_ENTITY_FIELD_PREFIX, ID_FIELD, MUTATION_ID_ARG, MUTATION_INPUT_ARG,
    UPDATE_ENTITY_FIELD_PREFIX
} from '../schema/schema-defaults';
import { createEntityObjectNode } from './queries';
import { isChildEntityType, isEntityExtensionType } from '../schema/schema-utils';
import { decapitalize, objectValues } from '../utils/utils';
import {
    getAddChildEntityFieldName, getRemoveChildEntityFieldName, getUpdateChildEntityFieldName
} from '../graphql/names';

/**
 * Creates a QueryNode for a field of the root mutation type
 * @param {FieldRequest} fieldRequest the mutation field, such as createSomeEntity
 */
export function createMutationRootNode(fieldRequest: FieldRequest): QueryNode {
    if (fieldRequest.fieldName.startsWith(CREATE_ENTITY_FIELD_PREFIX)) {
        return createCreateEntityQueryNode(fieldRequest, [fieldRequest]);
    }

    if (fieldRequest.fieldName.startsWith(UPDATE_ENTITY_FIELD_PREFIX)) {
        return createUpdateEntityQueryNode(fieldRequest, [fieldRequest]);
    }

    if (fieldRequest.fieldName.startsWith(DELETE_ENTITY_FIELD_PREFIX)) {
        return createDeleteEntityQueryNode(fieldRequest, [fieldRequest]);
    }

    console.log(`unknown field: ${fieldRequest.fieldName}`);
    return new NullQueryNode();
}

function createCreateEntityQueryNode(fieldRequest: FieldRequest, fieldRequestStack: FieldRequest[]): QueryNode {
    const entityName = fieldRequest.fieldName.substr('create'.length);
    const entityType = fieldRequest.schema.getTypeMap()[entityName];
    if (!entityType || !(entityType instanceof GraphQLObjectType)) {
        throw new Error(`Object type ${entityName} not found but needed for field ${fieldRequest.fieldName}`);
    }
    const input = fieldRequest.args[MUTATION_INPUT_ARG];
    // TODO special handling for generated ids of child entities
    const objectNode = new LiteralQueryNode(input);
    const createEntityNode = new CreateEntityQueryNode(entityType, objectNode);
    const newEntityVarNode = new VariableQueryNode('newEntity');
    const resultNode = createEntityObjectNode(fieldRequest.selectionSet, newEntityVarNode, fieldRequestStack);
    return new VariableAssignmentQueryNode({
        variableValueNode: createEntityNode,
        resultNode,
        variableNode: newEntityVarNode
    });
}

function createUpdateEntityQueryNode(fieldRequest: FieldRequest, fieldRequestStack: FieldRequest[]): QueryNode {
    const entityName = fieldRequest.fieldName.substr('create'.length);
    const entityType = fieldRequest.schema.getTypeMap()[entityName];
    if (!entityType || !(entityType instanceof GraphQLObjectType)) {
        throw new Error(`Object type ${entityName} not found but needed for field ${fieldRequest.fieldName}`);
    }
    const input = fieldRequest.args[MUTATION_INPUT_ARG];
    const idField = entityType.getFields()[ID_FIELD];
    const currentEntityVarNode = new VariableQueryNode('currentEntity');
    const filterNode = new BinaryOperationQueryNode(new FieldQueryNode(currentEntityVarNode, idField),
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
    const resultNode = createEntityObjectNode(fieldRequest.selectionSet, updatedEntityVarNode, fieldRequestStack);
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

function createUpdatePropertiesSpecification(obj: any, parentType: GraphQLObjectType, oldEntityNode: QueryNode): PropertySpecification[] {
    if (typeof obj != 'object') {
        return [];
    }

    const properties: PropertySpecification[] = [];
    for (const field of objectValues(parentType.getFields())) {
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
                // TODO special handling for generated ids
                const newNode = new ListQueryNode(newValues.map((value: any) => new LiteralQueryNode(value)));
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
        } else if (field.name in obj) {
            // TODO do not include id in entities
            // scalars and value objects
            properties.push(new PropertySpecification(field.name, new LiteralQueryNode(obj[field.name])));
        }
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
    // TODO special handling for generated ids of child entities

    const idField = entityType.getFields()[ID_FIELD];
    const currentEntityVarNode = new VariableQueryNode('currentEntity');
    const filterNode = new BinaryOperationQueryNode(new FieldQueryNode(currentEntityVarNode, idField),
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
        variableNode: deletedEntityVarNode,
    });
}
