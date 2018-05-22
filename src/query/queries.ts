import { FieldRequest, FieldSelection } from '../graphql/query-distiller';
import { getNamedType, GraphQLField, GraphQLObjectType } from 'graphql';
import {
    BasicType, BinaryOperationQueryNode, BinaryOperator, ConditionalQueryNode, EntitiesQueryNode, FirstOfListQueryNode,
    ListQueryNode, LiteralQueryNode, NullQueryNode, ObjectQueryNode, PropertySpecification, QueryNode,
    TransformListQueryNode, TypeCheckQueryNode, VariableQueryNode
} from '../query-tree';
import { createCursorQueryNode, createOrderSpecification, createPaginationFilterNode } from './pagination-and-sorting';
import { createFilterNode } from './filtering';
import { ALL_ENTITIES_FIELD_PREFIX, CURSOR_FIELD, FILTER_ARG, FIRST_ARG } from '../schema/schema-defaults';
import { decapitalize, objectEntries } from '../utils/utils';
import { createListFieldValueNode, createNonListFieldValueNode, createScalarFieldValueNode } from './fields';
import { createListMetaNode } from './list-meta';
import { Namespace, ObjectType, RootEntityType } from '../model';

/**
 * Creates a QueryNode for a field of the root query type
 * @param {FieldRequest} fieldRequest the query field, such as allEntities
 */
export function createQueryNamespaceNode(fieldRequest: FieldRequest, fieldRequestStack: FieldRequest[], namespace: Namespace): QueryNode {
    if (isEntitiesQueryField(fieldRequest.field)) {
        return createAllEntitiesFieldNode(fieldRequest, [...fieldRequestStack, fieldRequest], namespace);
    }
    if (isMetaField(fieldRequest.field)) {
        return createEntitiesMetaFieldNode(fieldRequest, fieldRequestStack, namespace);
    }
    const childNamespace = namespace.getChildNamespace(fieldRequest.fieldName);
    if (childNamespace) {
        return createQueryNamespaceFieldNode(fieldRequest, [...fieldRequestStack, fieldRequest], childNamespace)
    }
    const rootEntityType = namespace.getRootEntityType(getNamedType(fieldRequest.field.type).name);
    if (rootEntityType) {
        return createSingleEntityFieldNode(fieldRequest, [...fieldRequestStack, fieldRequest], rootEntityType);
    }

    throw new Error(`Field "${fieldRequest.fieldName}" is not known in namespace "${namespace.dotSeparatedPath}"`);
}

function createQueryNamespaceFieldNode(fieldRequest: FieldRequest, fieldRequestStack: FieldRequest[], namespace: Namespace): QueryNode {
    return new ObjectQueryNode(fieldRequest.selectionSet.map(
        sel => new PropertySpecification(sel.propertyName,
            // a namespace can be interpreted as pushing the root node down.
            createQueryNamespaceNode(sel.fieldRequest, fieldRequestStack, namespace))));
}

function createAllEntitiesFieldNode(fieldRequest: FieldRequest, fieldRequestStack: FieldRequest[], namespace: Namespace): QueryNode {
    const rootEntityType = namespace.getRootEntityTypeOrThrow(getNamedType(fieldRequest.field.type).name);
    const listNode = new EntitiesQueryNode(rootEntityType);
    const itemVariable = new VariableQueryNode(decapitalize(rootEntityType.name));
    const innerNode = createEntityObjectNode(fieldRequest.selectionSet, itemVariable, rootEntityType, fieldRequestStack);
    return createTransformListQueryNode(fieldRequest, listNode, itemVariable, innerNode, rootEntityType, fieldRequestStack);
}

function createEntitiesMetaFieldNode(fieldRequest: FieldRequest, fieldRequestStack: FieldRequest[], namespace: Namespace): QueryNode {
    const listField = findOriginalFieldForMetaFieldInNamespace(fieldRequest, fieldRequestStack);
    const objectType = namespace.getRootEntityTypeOrThrow(getNamedType(listField.type).name);
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

function createSingleEntityFieldNode(fieldRequest: FieldRequest, fieldRequestStack: FieldRequest[], rootEntityType: RootEntityType): QueryNode {
    const entityVarNode = new VariableQueryNode(decapitalize(rootEntityType.name));
    const filterClauses = objectEntries(fieldRequest.args).map(([fieldName, value]) =>
        new BinaryOperationQueryNode(createScalarFieldValueNode(rootEntityType, fieldName, entityVarNode), BinaryOperator.EQUAL, new LiteralQueryNode(value)));
    if (filterClauses.length != 1) {
        throw new Error(`Must specify exactly one argument to ${fieldRequest.parentType.toString()}.${fieldRequest.field.name}`);
    }
    const filterNode = filterClauses[0];
    const innerNode = createConditionalObjectNode(fieldRequest.selectionSet, entityVarNode, rootEntityType, fieldRequestStack);
    const listNode = new EntitiesQueryNode(rootEntityType);
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
 * @param {QueryNode} objectNode a node that evaluates to the entity
 * @param {FieldRequest[]} fieldRequestStack parent field requests, up to (including) the enclosing fieldRequest of fieldSeletions
 * @returns {ObjectQueryNode}
 */
export function createEntityObjectNode(fieldSelections: FieldSelection[], objectNode: QueryNode, objectType: ObjectType, fieldRequestStack: FieldRequest[]) {
    return new ObjectQueryNode(fieldSelections.map(
        sel => new PropertySpecification(sel.propertyName,
            createEntityFieldQueryNode(sel.fieldRequest, objectNode, objectType, [...fieldRequestStack, sel.fieldRequest]))));
}

/**
 * Creates a QueryNode for a specific field to query from an entity
 * @param {FieldRequest} fieldRequest the field, e.g. "id"
 * @param {QueryNode} objectNode the QueryNode that evaluates to the entity
 * @param {FieldRequest[]} fieldRequestStack parent field requests, up to (including) the fieldRequest arg
 * @returns {QueryNode}
 */
function createEntityFieldQueryNode(fieldRequest: FieldRequest, objectNode: QueryNode, objectType: ObjectType, fieldRequestStack: FieldRequest[]): QueryNode {
    if (fieldRequest.fieldName == CURSOR_FIELD) {
        return createCursorQueryNode(fieldRequestStack[fieldRequestStack.length - 2], objectNode, objectType);
    }

    if (isMetaField(fieldRequest.field)) {
        const listFieldName = unwrapMetaFieldName(fieldRequest.field);
        const listField = objectType.getFieldOrThrow(listFieldName);
        const listNode = createListFieldValueNode({
            objectNode,
            parentType: objectType,
            field: listField});
        return createListMetaNode(fieldRequest, listNode, listField.type);
    }

    const field = objectType.getFieldOrThrow(fieldRequest.fieldName);

    if (field.isList) {
        const listNode = createListFieldValueNode({
            objectNode,
            parentType: objectType,
            field});
        if (field.type.isObjectType) {
            // support filters, order by and pagination
            const itemVariable = new VariableQueryNode(decapitalize(field.type.name));
            const innerNode = createEntityObjectNode(fieldRequest.selectionSet, itemVariable, field.type, fieldRequestStack);
            return createTransformListQueryNode(fieldRequest, listNode, itemVariable, innerNode, field.type, fieldRequestStack);
        } else {
            return listNode;
        }
    }

    return createNonListFieldValueNode({
        objectNode,
        parentType: objectType,
        field,
        innerNodeFn: valueNode => field.type.isObjectType ? createConditionalObjectNode(fieldRequest.selectionSet, valueNode, field.type, fieldRequestStack) : valueNode
    });
}

function createConditionalObjectNode(fieldSelections: FieldSelection[], contextNode: QueryNode, objectType: ObjectType, fieldRequestStack: FieldRequest[]) {
    return new ConditionalQueryNode(
        new TypeCheckQueryNode(contextNode, BasicType.OBJECT),
        createEntityObjectNode(fieldSelections, contextNode, objectType, fieldRequestStack),
        new NullQueryNode());
}

export function createTransformListQueryNode(fieldRequest: FieldRequest, listNode: QueryNode, itemVariable: VariableQueryNode, innerNode: QueryNode, itemType: ObjectType, fieldRequestStack: FieldRequest[]): QueryNode {
    let orderBy = createOrderSpecification(itemType, fieldRequest, itemVariable);
    const basicFilterNode = createFilterNode(fieldRequest.args[FILTER_ARG], itemType, itemVariable);
    const paginationFilterNode = createPaginationFilterNode(itemType, fieldRequest, itemVariable);
    let filterNode: QueryNode = new BinaryOperationQueryNode(basicFilterNode, BinaryOperator.AND, paginationFilterNode);
    const maxCount = fieldRequest.args[FIRST_ARG];

    return new TransformListQueryNode({
        listNode,
        innerNode,
        filterNode,
        orderBy,
        maxCount,
        itemVariable
    });
}

export function createSafeListQueryNode(listNode: QueryNode) {
    // to avoid errors because of eagerly evaluated list expression, we just convert non-lists to an empty list
    return new ConditionalQueryNode(
        new TypeCheckQueryNode(listNode, BasicType.LIST),
        listNode,
        new ListQueryNode([])
    );
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
