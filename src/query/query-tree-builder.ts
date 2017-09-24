import { DistilledOperation, FieldRequest, FieldSelection } from '../graphql/query-distiller';
import { getNamedType, GraphQLCompositeType, GraphQLField, GraphQLList, GraphQLObjectType } from 'graphql';
import {
    BasicType, BinaryOperationQueryNode, BinaryOperator, ConditionalQueryNode, ContextAssignmentQueryNode,
    ContextQueryNode, CreateEntityQueryNode, EntitiesQueryNode, FieldQueryNode, ListQueryNode, LiteralQueryNode,
    ObjectQueryNode, OrderClause, OrderDirection, OrderSpecification, PropertySpecification, QueryNode,
    TypeCheckQueryNode
} from './definition';
import { isArray } from 'util';

/**
 * Creates a QueryTree that is used to instruct the DataBase how to perform a GraphQL query
 * @param {FieldRequest} rootFieldRequest the graphql query
 */
export function createQueryTree(operation: DistilledOperation) {
    return createObjectNode(operation.selectionSet);
}

function createObjectNode(fieldSelections: FieldSelection[], contextNode: QueryNode = new ContextQueryNode()) {
    return new ObjectQueryNode(fieldSelections.map(
        sel => new PropertySpecification(sel.propertyName, createQueryNodeForField(sel.fieldRequest, contextNode))));
}

function createConditionalObjectNode(fieldSelections: FieldSelection[], contextNode: QueryNode = new ContextQueryNode()) {
    return new ConditionalQueryNode(
        new TypeCheckQueryNode(contextNode, BasicType.OBJECT),
        createObjectNode(fieldSelections, contextNode),
        new LiteralQueryNode(null));
}

function createQueryNodeForField(fieldRequest: FieldRequest, contextNode: QueryNode = new ContextQueryNode()): QueryNode {
    if (isQueryType(fieldRequest.parentType) && isEntitiesQueryField(fieldRequest.field)) {
        return createEntitiesQueryNode(fieldRequest);
    }
    if (isMutationType(fieldRequest.parentType)) {
        if (fieldRequest.fieldName.startsWith('create')) {
            return createCreateEntityQueryNode(fieldRequest);
        }
    }
    if (isEntityType(fieldRequest.parentType)) {
        const type = fieldRequest.field.type;
        const rawType = getNamedType(type);
        const fieldNode = new FieldQueryNode(contextNode, fieldRequest.field);
        if (type instanceof GraphQLList && rawType instanceof GraphQLObjectType) {
            return createConditionalListQueryNode(fieldRequest, fieldNode);
        }
        if (rawType instanceof GraphQLObjectType) {
            return createConditionalObjectNode(fieldRequest.selectionSet, fieldNode);
        }
        return fieldNode;
    }
    console.log(`unknown field: ${fieldRequest.fieldName}`);
    return new LiteralQueryNode(null);
}

function createListQueryNode(fieldRequest: FieldRequest, listNode: QueryNode): QueryNode {
    const objectType = getNamedType(fieldRequest.field.type) as GraphQLObjectType;
    const filterNode = getFilterNode(fieldRequest.args.filter, objectType);
    const innerNode = createObjectNode(fieldRequest.selectionSet);
    const orderBy = createOrderSpecification(fieldRequest.args.orderBy, objectType);
    const maxCount = fieldRequest.args.first;
    return new ListQueryNode({listNode, innerNode, filterNode, orderBy, maxCount});
}

function createConditionalListQueryNode(fieldRequest: FieldRequest, listNode: QueryNode): QueryNode {
    // to avoid errors because of eagerly evaluated list expression, we just convert non-lists to an empty list
    const safeList = new ConditionalQueryNode(
        new TypeCheckQueryNode(listNode, BasicType.LIST),
        listNode,
        new LiteralQueryNode([])
    );

    return createListQueryNode(fieldRequest, safeList);
}

function createEntitiesQueryNode(fieldRequest: FieldRequest): QueryNode {
    const objectType = getNamedType(fieldRequest.field.type) as GraphQLObjectType;
    const listNode = new EntitiesQueryNode(objectType);
    return createListQueryNode(fieldRequest, listNode);
}

function getFilterNode(filterArg: any, objectType: GraphQLObjectType, contextNode: QueryNode = new ContextQueryNode()) {
    if (!filterArg || !Object.keys(filterArg).length) {
        return undefined;
    }
    let filterNode: QueryNode|undefined = undefined;
    for (const key of Object.getOwnPropertyNames(filterArg)) {
        const newClause = getFilterClauseNode(key, filterArg[key], contextNode, objectType);
        if (filterNode) {
            filterNode = new BinaryOperationQueryNode(filterNode, BinaryOperator.AND, newClause);
        } else {
            filterNode = newClause;
        }
    }
    return filterNode;
}

function getFilterClauseNode(key: string, value: any, contextNode: QueryNode, objectType: GraphQLObjectType): QueryNode {
    // check for filters in embedded objects
    const field = objectType.getFields()[key];
    const rawFieldType = field ? getNamedType(field.type) : undefined;
    if (field && rawFieldType instanceof GraphQLObjectType) {
        const fieldNode = new FieldQueryNode(contextNode, field);
        const isObjectNode = new TypeCheckQueryNode(fieldNode, BasicType.OBJECT);
        const rawFilterNode = getFilterNode(value, rawFieldType, fieldNode);
        if (!rawFilterNode) {
            return isObjectNode; // an empty filter only checks if the object is present and a real object
        }
        // make sure to check for object type before doing the filter
        return new BinaryOperationQueryNode(isObjectNode, BinaryOperator.AND, rawFilterNode);
    }

    const variations: {[suffix: string]: (fieldNode: QueryNode, valueNode: QueryNode) => QueryNode} = {
        '_not': (fieldNode, valueNode) => new BinaryOperationQueryNode(fieldNode, BinaryOperator.UNEQUAL, valueNode),
        '_lt': (fieldNode, valueNode) => new BinaryOperationQueryNode(fieldNode, BinaryOperator.LESS_THAN, valueNode),
        '_lte': (fieldNode, valueNode) => new BinaryOperationQueryNode(fieldNode, BinaryOperator.LESS_THAN_OR_EQUAL, valueNode),
        '_gt': (fieldNode, valueNode) => new BinaryOperationQueryNode(fieldNode, BinaryOperator.GREATER_THAN, valueNode),
        '_gte': (fieldNode, valueNode) => new BinaryOperationQueryNode(fieldNode, BinaryOperator.GREATER_THAN_OR_EQUAL, valueNode),
        '': (fieldNode, valueNode) => new BinaryOperationQueryNode(fieldNode, BinaryOperator.EQUAL, valueNode),
    };

    for (const suffix in variations) {
        if (key.endsWith(suffix)) {
            const fieldName = key.substr(0, key.length - suffix.length);
            const field = objectType.getFields()[fieldName];
            if (!field) {
                throw new Error(`Field ${fieldName} does not exist in type ${objectType.name} but is used as a filter`);
            }
            const fieldNode = new FieldQueryNode(contextNode, field);
            const valueNode = new LiteralQueryNode(value);
            return variations[suffix](fieldNode, valueNode);
        }
    }
    throw new Error(`Invalid filter field: ${key}`);
}

function createOrderSpecification(orderByArg: any, objectType: GraphQLObjectType) {
    if (!orderByArg || isArray(orderByArg) && !orderByArg.length) {
        return new OrderSpecification([]);
    }
    const clauseNames = isArray(orderByArg) ? orderByArg : [ orderByArg ];
    const clauses = clauseNames.map(name => {
        let dir = OrderDirection.ASCENDING;
        if (name.endsWith('_ASC')) {
            name = name.substr(0, name.length - 4);
        } else if (name.endsWith('_DESC')) {
            name = name.substr(0, name.length - 5);
            dir = OrderDirection.DESCENDING;
        }
        const field = objectType.getFields()[name];
        const fieldQuery = new FieldQueryNode(new ContextQueryNode(), field);
        return new OrderClause(fieldQuery, dir);
    });
    return new OrderSpecification(clauses);
}

function createCreateEntityQueryNode(fieldRequest: FieldRequest): QueryNode {
    const entityName = fieldRequest.fieldName.substr('create'.length);
    const entityType = fieldRequest.schema.getTypeMap()[entityName];
    if (!entityType || !(entityType instanceof GraphQLObjectType)) {
        throw new Error(`Object type ${entityName} not found but needed for field ${fieldRequest.fieldName}`);
    }
    const input = fieldRequest.args['input'];
    const objectNode = new LiteralQueryNode(input);
    const createEntityNode = new CreateEntityQueryNode(entityType, objectNode);
    const resultNode = createObjectNode(fieldRequest.selectionSet);
    return new ContextAssignmentQueryNode(createEntityNode, resultNode);
}

function isQueryType(type: GraphQLCompositeType) {
    return type.name == 'Query';
}

function isMutationType(type: GraphQLCompositeType) {
    return type.name == 'Mutation';
}

function isEntityType(type: GraphQLCompositeType) {
    return type.name != 'Query' && type.name != 'Mutation';
}

function isEntitiesQueryField(field: GraphQLField<any, any>) {
    return field.name.startsWith('all');
}
