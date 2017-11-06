import { FieldRequest, FieldSelection } from '../graphql/query-distiller';
import {FieldDefinitionNode, getNamedType, GraphQLField, GraphQLObjectType, ObjectTypeDefinitionNode} from 'graphql';
import {
    BasicType, BinaryOperationQueryNode, BinaryOperator, ConditionalQueryNode, EntitiesQueryNode, FieldQueryNode,
    FirstOfListQueryNode, FollowEdgeQueryNode, ListQueryNode, LiteralQueryNode, NullQueryNode, ObjectQueryNode,
    PropertySpecification, QueryNode, TransformListQueryNode, TypeCheckQueryNode, VariableAssignmentQueryNode,
    VariableQueryNode
} from './definition';
import { createCursorQueryNode, createOrderSpecification, createPaginationFilterNode } from './pagination-and-sorting';
import { createFilterNode } from './filtering';
import {
    ALL_ENTITIES_FIELD_PREFIX, CURSOR_FIELD, FILTER_ARG, FIRST_ARG,
    NAMESPACE_FIELD_PATH_DIRECTIVE
} from '../schema/schema-defaults';
import { decapitalize, objectEntries } from '../utils/utils';
import { createNonListFieldValueNode, createScalarFieldValueNode } from './fields';
import { isListType } from '../graphql/schema-utils';
import {hasDirectiveWithName, isReferenceField, isRelationField} from '../schema/schema-utils';
import { getEdgeType } from '../schema/edges';
import { createListMetaNode } from './list-meta';
import { extractVariableAssignments, extractVariableAssignmentsInOrderSpecification } from './query-tree-utils';
import {createFieldNode, createSelectionChain} from "../graphql/language-utils";

/**
 * Creates a QueryNode for a field of the root query type
 * @param {FieldRequest} fieldRequest the query field, such as allEntities
 */
export function createQueryNamespaceNode(fieldRequest: FieldRequest, fieldRequestStack: FieldRequest[]): QueryNode {
    if (isEntitiesQueryField(fieldRequest.field)) {
        return createAllEntitiesFieldNode(fieldRequest, [...fieldRequestStack, fieldRequest]);
    }
    if (isMetaField(fieldRequest.field)) {
        return createEntitiesMetaFieldNode(fieldRequest, fieldRequestStack);
    }
    if (fieldRequest.field.type instanceof GraphQLObjectType && hasDirectiveWithName(fieldRequest.field.astNode as FieldDefinitionNode, NAMESPACE_FIELD_PATH_DIRECTIVE)) {
        return createQueryNamespaceFieldNode(fieldRequest, [...fieldRequestStack, fieldRequest])
    }
    if (fieldRequest.field.type instanceof GraphQLObjectType) {
        return createSingleEntityFieldNode(fieldRequest, [...fieldRequestStack, fieldRequest]);
    }

    console.log(`unknown field: ${fieldRequest.fieldName}`);
    return new NullQueryNode();
}

function createQueryNamespaceFieldNode(fieldRequest: FieldRequest, fieldRequestStack: FieldRequest[]): QueryNode {
        return new ObjectQueryNode(fieldRequest.selectionSet.map(
            sel => new PropertySpecification(sel.propertyName,
                // a namespace can be interpreted as pushing the root node down.
                createQueryNamespaceNode(sel.fieldRequest, fieldRequestStack))));
}

function createAllEntitiesFieldNode(fieldRequest: FieldRequest, fieldRequestStack: FieldRequest[]): QueryNode {
    const objectType = getNamedType(fieldRequest.field.type) as GraphQLObjectType;
    const listNode = new EntitiesQueryNode(objectType);
    // (node.roles INTERSECT requestRoles) > 0
    return createTransformListQueryNode(fieldRequest, listNode, fieldRequestStack);
}

function createEntitiesMetaFieldNode(fieldRequest: FieldRequest, fieldRequestStack: FieldRequest[]): QueryNode {
    const listField = findOriginalFieldForMetaFieldInNamespace(fieldRequest, fieldRequestStack);
    const objectType = getNamedType(listField.type) as GraphQLObjectType;
    const listNode = new EntitiesQueryNode(objectType);
    return createListMetaNode(fieldRequest, listNode, objectType);
}

function findOriginalFieldForMetaFieldInNamespace(fieldRequest: FieldRequest, fieldRequestStack: FieldRequest[]) {
    const listFieldName = unwrapMetaFieldName(fieldRequest.field);
    // walk through namespaces, start at root query type.
    let currentNamespaceNode = fieldRequest.schema.getQueryType();
    const pathRemaining = [...fieldRequestStack];
    while(pathRemaining.length) {
        const nextFieldNode = pathRemaining.shift()!;
        const nextType = getNamedType(currentNamespaceNode.getFields()[nextFieldNode.field.name].type);
        if (!(nextType instanceof GraphQLObjectType)) {
            throw new Error("Expected object type");
        }
        currentNamespaceNode = nextType;
    }
    const listField = currentNamespaceNode.getFields()[listFieldName];
    if (!listField) {
        throw new Error(`Requesting meta field ${fieldRequest.fieldName}, but list field ${listFieldName} does not exist on Query`);
    }
    return listField;
}

function createSingleEntityFieldNode(fieldRequest: FieldRequest, fieldRequestStack: FieldRequest[]): QueryNode {
    const objectType = getNamedType(fieldRequest.field.type) as GraphQLObjectType;
    const entityVarNode = new VariableQueryNode(decapitalize(objectType.name));
    const filterClauses = objectEntries(fieldRequest.args).map(([fieldName, value]) =>
        new BinaryOperationQueryNode(createScalarFieldValueNode(objectType, fieldName, entityVarNode), BinaryOperator.EQUAL, new LiteralQueryNode(value)));
    if (filterClauses.length != 1) {
        throw new Error(`Must specify exactly one argument to ${fieldRequest.field.type.toString()}.${fieldRequest.field.name}`);
    }
    const filterNode = filterClauses[0];
    const innerNode = createConditionalObjectNode(fieldRequest.selectionSet, entityVarNode, fieldRequestStack);
    const listNode = new EntitiesQueryNode(objectType);
    const filteredListNode = new TransformListQueryNode({
        listNode,
        filterNode,
        innerNode,
        itemVariable: entityVarNode
    });
    return new FirstOfListQueryNode(filteredListNode);
}

/**
 * Creates a QueryNode for the value of querying a specific entity
 * @param {FieldSelection[]} fieldSelections specifies what to select in the entity (e.g. the fieldSelections of an allEntities query)
 * @param {QueryNode} sourceObjectNode a node that evaluates to the entity
 * @param {FieldRequest[]} fieldRequestStack parent field requests, up to (including) the enclosing fieldRequest of fieldSeletions
 * @returns {ObjectQueryNode}
 */
export function createEntityObjectNode(fieldSelections: FieldSelection[], sourceObjectNode: QueryNode, fieldRequestStack: FieldRequest[]) {
    return new ObjectQueryNode(fieldSelections.map(
        sel => new PropertySpecification(sel.propertyName,
            createEntityFieldQueryNode(sel.fieldRequest, sourceObjectNode, [...fieldRequestStack, sel.fieldRequest]))));
}

function createToNRelationQueryNode(fieldRequest: FieldRequest, sourceEntityNode: QueryNode, fieldRequestStack: FieldRequest[]): QueryNode {
    const edgeType = getEdgeType(getNamedType(fieldRequest.parentType) as GraphQLObjectType, fieldRequest.field);
    const followNode = new FollowEdgeQueryNode(edgeType, sourceEntityNode);
    return createTransformListQueryNode(fieldRequest, followNode, fieldRequestStack);
}

/**
 * Creates a QueryNode for a specific field to query from an entity
 * @param {FieldRequest} fieldRequest the field, e.g. "id"
 * @param {QueryNode} objectNode the QueryNode that evaluates to the entity
 * @param {FieldRequest[]} fieldRequestStack parent field requests, up to (including) the fieldRequest arg
 * @returns {QueryNode}
 */
function createEntityFieldQueryNode(fieldRequest: FieldRequest, objectNode: QueryNode, fieldRequestStack: FieldRequest[]): QueryNode {
    if (fieldRequest.fieldName == CURSOR_FIELD) {
        return createCursorQueryNode(fieldRequestStack[fieldRequestStack.length - 2], objectNode);
    }

    const type = fieldRequest.field.type;
    const rawType = getNamedType(type);

    if (isMetaField(fieldRequest.field)) {
        const objectType = fieldRequest.parentType as GraphQLObjectType;
        const listFieldName = unwrapMetaFieldName(fieldRequest.field);
        const listField = objectType.getFields()[listFieldName];
        if (!listField) {
            throw new Error(`Requested meta field ${fieldRequest.field.name} but associated list field ${listFieldName} does not exist in object type ${objectType.name}`);
        }
        let listNode: QueryNode;
        if (isRelationField(listField)) {
            const edgeType = getEdgeType(getNamedType(fieldRequest.parentType) as GraphQLObjectType, listField);
            listNode = new FollowEdgeQueryNode(edgeType, objectNode);
        } else if (isReferenceField(listField)) {
            throw new Error(`${fieldRequest.fieldName}: references in lists are not supported yet`);
        } else {
            listNode = createSafeListQueryNode(new FieldQueryNode(objectNode, listField));
        }
        return createListMetaNode(fieldRequest, listNode, getNamedType(listField.type) as GraphQLObjectType);
    }

    if (isListType(type)) {
        if (isRelationField(fieldRequest.field)) {
            return createToNRelationQueryNode(fieldRequest, objectNode, fieldRequestStack);
        }
        if (isReferenceField(fieldRequest.field)) {
            throw new Error(`${fieldRequest.fieldName}: references in lists are not supported yet`);
        }
        if (rawType instanceof GraphQLObjectType) {
            // support filters, order by and pagination
            return createSafeTransformListQueryNode(fieldRequest, new FieldQueryNode(objectNode, fieldRequest.field), fieldRequestStack);
        } else {
            return createSafeListQueryNode(new FieldQueryNode(objectNode, fieldRequest.field));
        }
    }

    return createNonListFieldValueNode({
        objectNode,
        parentType: fieldRequest.parentType as GraphQLObjectType,
        field: fieldRequest.field,
        innerNodeFn: valueNode => rawType instanceof GraphQLObjectType ? createConditionalObjectNode(fieldRequest.selectionSet, valueNode, fieldRequestStack) : valueNode
    });
}

function createConditionalObjectNode(fieldSelections: FieldSelection[], contextNode: QueryNode, fieldRequestStack: FieldRequest[]) {
    return new ConditionalQueryNode(
        new TypeCheckQueryNode(contextNode, BasicType.OBJECT),
        createEntityObjectNode(fieldSelections, contextNode, fieldRequestStack),
        new NullQueryNode());
}

function createTransformListQueryNode(fieldRequest: FieldRequest, listNode: QueryNode, fieldRequestStack: FieldRequest[]): QueryNode {
    let variableAssignmentNodes: VariableAssignmentQueryNode[] = [];
    const objectType = getNamedType(fieldRequest.field.type) as GraphQLObjectType;
    const itemVariable = new VariableQueryNode(decapitalize(objectType.name));
    let orderBy = createOrderSpecification(objectType, fieldRequest, itemVariable);
    const basicFilterNode = createFilterNode(fieldRequest.args[FILTER_ARG], objectType, itemVariable);
    const paginationFilterNode = createPaginationFilterNode(objectType, fieldRequest, itemVariable);
    let filterNode: QueryNode = new BinaryOperationQueryNode(basicFilterNode, BinaryOperator.AND, paginationFilterNode);
    let innerNode: QueryNode = createEntityObjectNode(fieldRequest.selectionSet, itemVariable, fieldRequestStack);

    // pull the variables assignments up as they might have been duplicated
    orderBy = extractVariableAssignmentsInOrderSpecification(orderBy, variableAssignmentNodes);
    filterNode = extractVariableAssignments(filterNode, variableAssignmentNodes);
    innerNode = extractVariableAssignments(innerNode, variableAssignmentNodes);
    variableAssignmentNodes = Array.from(new Set(variableAssignmentNodes)); // deduplicate

    const maxCount = fieldRequest.args[FIRST_ARG];
    return new TransformListQueryNode({
        listNode,
        innerNode,
        filterNode,
        orderBy,
        maxCount,
        itemVariable,
        variableAssignmentNodes
    });
}

function createSafeListQueryNode(listNode: QueryNode) {
    // to avoid errors because of eagerly evaluated list expression, we just convert non-lists to an empty list
    return new ConditionalQueryNode(
        new TypeCheckQueryNode(listNode, BasicType.LIST),
        listNode,
        new ListQueryNode([])
    );
}

function createSafeTransformListQueryNode(fieldRequest: FieldRequest, listNode: QueryNode, fieldRequestStack: FieldRequest[]): QueryNode {
    return createTransformListQueryNode(fieldRequest, createSafeListQueryNode(listNode), fieldRequestStack);
}

function isEntitiesQueryField(field: GraphQLField<any, any>) {
    return field.name.startsWith(ALL_ENTITIES_FIELD_PREFIX);
}

function isMetaField(field: GraphQLField<any, any>) {
    return field.name.startsWith('_') && field.name.endsWith('Meta');
}

function unwrapMetaFieldName(field: GraphQLField<any, any>): string {
    return field.name.substr(1, field.name.length - '_Meta'.length);
}