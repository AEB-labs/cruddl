import { DistilledOperation, FieldRequest, FieldSelection } from '../graphql/query-distiller';
import {
    getNamedType, GraphQLCompositeType, GraphQLField, GraphQLList, GraphQLObjectType, GraphQLScalarType
} from 'graphql';
import {
    BasicType, BinaryOperationQueryNode, BinaryOperator, ConditionalQueryNode, ConstBoolQueryNode,
    ContextAssignmentQueryNode, ContextQueryNode, CreateEntityQueryNode, EntitiesQueryNode, FieldQueryNode,
    ListQueryNode, LiteralQueryNode, NullQueryNode, ObjectQueryNode, OrderClause, OrderDirection, OrderSpecification,
    PropertySpecification, QueryNode, TypeCheckQueryNode, UnaryOperationQueryNode, UnaryOperator
} from './definition';
import { isArray } from 'util';
import { isListType } from '../graphql/schema-utils';

/**
 * Creates a QueryTree that is used to instruct the DataBase how to perform a GraphQL query
 * @param {FieldRequest} operation the graphql query
 */
export function createQueryTree(operation: DistilledOperation) {
    return createObjectNode(operation.selectionSet, new NullQueryNode(), []);
}

function createObjectNode(fieldSelections: FieldSelection[], contextNode: QueryNode, fieldRequestStack: FieldRequest[]) {
    return new ObjectQueryNode(fieldSelections.map(
        sel => new PropertySpecification(sel.propertyName,
            createQueryNodeForField(sel.fieldRequest, contextNode, [...fieldRequestStack, sel.fieldRequest]))));
}

function createConditionalObjectNode(fieldSelections: FieldSelection[], contextNode: QueryNode, fieldRequestStack: FieldRequest[]) {
    return new ConditionalQueryNode(
        new TypeCheckQueryNode(contextNode, BasicType.OBJECT),
        createObjectNode(fieldSelections, contextNode, fieldRequestStack),
        new LiteralQueryNode(null));
}

function createQueryNodeForField(fieldRequest: FieldRequest, contextNode: QueryNode, fieldRequestStack: FieldRequest[]): QueryNode {
    if (isQueryType(fieldRequest.parentType) && isEntitiesQueryField(fieldRequest.field)) {
        return createEntitiesQueryNode(fieldRequest, fieldRequestStack);
    }
    if (isMutationType(fieldRequest.parentType)) {
        if (fieldRequest.fieldName.startsWith('create')) {
            return createCreateEntityQueryNode(fieldRequest, fieldRequestStack);
        }
    }
    if (isEntityType(fieldRequest.parentType)) {
        if (fieldRequest.fieldName == '_cursor') {
            return createCursorQueryNode(fieldRequestStack[fieldRequestStack.length - 2], new ContextQueryNode());
        }

        const type = fieldRequest.field.type;
        const rawType = getNamedType(type);
        const fieldNode = new FieldQueryNode(contextNode, fieldRequest.field);
        if (type instanceof GraphQLList && rawType instanceof GraphQLObjectType) {
            return createConditionalListQueryNode(fieldRequest, fieldNode, fieldRequestStack);
        }
        if (rawType instanceof GraphQLObjectType) {
            return createConditionalObjectNode(fieldRequest.selectionSet, fieldNode, fieldRequestStack);
        }
        return fieldNode;
    }
    console.log(`unknown field: ${fieldRequest.fieldName}`);
    return new LiteralQueryNode(null);
}

function createListQueryNode(fieldRequest: FieldRequest, listNode: QueryNode, fieldRequestStack: FieldRequest[]): QueryNode {
    const objectType = getNamedType(fieldRequest.field.type) as GraphQLObjectType;
    const orderBy = createOrderSpecification(fieldRequest.args.orderBy, objectType, fieldRequest);
    const basicFilterNode = getFilterNode(fieldRequest.args.filter, objectType);
    const paginationFilterNode = createPaginationFilterNode(fieldRequest.args.after, orderBy);
    const filterNode = new BinaryOperationQueryNode(basicFilterNode, BinaryOperator.AND, paginationFilterNode);
    const innerNode = createObjectNode(fieldRequest.selectionSet, new ContextQueryNode(), fieldRequestStack);
    const maxCount = fieldRequest.args.first;
    return new ListQueryNode({listNode, innerNode, filterNode, orderBy, maxCount});
}

function createConditionalListQueryNode(fieldRequest: FieldRequest, listNode: QueryNode, fieldRequestStack: FieldRequest[]): QueryNode {
    // to avoid errors because of eagerly evaluated list expression, we just convert non-lists to an empty list
    const safeList = new ConditionalQueryNode(
        new TypeCheckQueryNode(listNode, BasicType.LIST),
        listNode,
        new LiteralQueryNode([])
    );

    return createListQueryNode(fieldRequest, safeList, fieldRequestStack);
}

function createEntitiesQueryNode(fieldRequest: FieldRequest, fieldRequestStack: FieldRequest[]): QueryNode {
    const objectType = getNamedType(fieldRequest.field.type) as GraphQLObjectType;
    const listNode = new EntitiesQueryNode(objectType);
    return createListQueryNode(fieldRequest, listNode, fieldRequestStack);
}

function getFilterNode(filterArg: any, objectType: GraphQLObjectType, contextNode: QueryNode = new ContextQueryNode()): QueryNode {
    if (!filterArg || !Object.keys(filterArg).length) {
        return new ConstBoolQueryNode(true);
    }
    let filterNode: QueryNode | undefined = undefined;
    for (const key of Object.getOwnPropertyNames(filterArg)) {
        const newClause = getFilterClauseNode(key, filterArg[key], contextNode, objectType);
        if (filterNode && newClause) {
            filterNode = new BinaryOperationQueryNode(filterNode, BinaryOperator.AND, newClause);
        } else {
            filterNode = newClause;
        }
    }
    return filterNode || new ConstBoolQueryNode(true);
}

function getFilterClauseNode(key: string, value: any, contextNode: QueryNode, objectType: GraphQLObjectType): QueryNode {
    // special nodes
    switch (key) {
        case 'AND':
            if (!isArray(value) || !value.length) {
                return new ConstBoolQueryNode(true);
            }
            return value
                .map(itemValue => getFilterNode(itemValue, objectType, contextNode))
                .reduce((prev, current) => new BinaryOperationQueryNode(prev, BinaryOperator.AND, current));
        case 'OR':
            if (!isArray(value)) {
                return new ConstBoolQueryNode(true); // regard as omitted
            }
            if (!value.length) {
                return new ConstBoolQueryNode(false); // proper boolean logic (neutral element of OR is FALSE)
            }
            return value
                .map(itemValue => getFilterNode(itemValue, objectType, contextNode))
                .reduce((prev, current) => new BinaryOperationQueryNode(prev, BinaryOperator.OR, current));
    }

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

    function not(value: QueryNode) {
        return new UnaryOperationQueryNode(value, UnaryOperator.NOT);
    }

    const variations: { [suffix: string]: (fieldNode: QueryNode, valueNode: QueryNode) => QueryNode } = {
        // not's before the normal fields because they need to be matched first
        '_not': (fieldNode, valueNode) => new BinaryOperationQueryNode(fieldNode, BinaryOperator.UNEQUAL, valueNode),
        '_lt': (fieldNode, valueNode) => new BinaryOperationQueryNode(fieldNode, BinaryOperator.LESS_THAN, valueNode),
        '_lte': (fieldNode, valueNode) => new BinaryOperationQueryNode(fieldNode, BinaryOperator.LESS_THAN_OR_EQUAL, valueNode),
        '_gt': (fieldNode, valueNode) => new BinaryOperationQueryNode(fieldNode, BinaryOperator.GREATER_THAN, valueNode),
        '_gte': (fieldNode, valueNode) => new BinaryOperationQueryNode(fieldNode, BinaryOperator.GREATER_THAN_OR_EQUAL, valueNode),
        '_not_in': (fieldNode, valueNode) => not(new BinaryOperationQueryNode(fieldNode, BinaryOperator.GREATER_THAN_OR_EQUAL, valueNode)),
        '_in': (fieldNode, valueNode) => new BinaryOperationQueryNode(fieldNode, BinaryOperator.IN, valueNode),
        '_not_contains': (fieldNode, valueNode) => not(new BinaryOperationQueryNode(fieldNode, BinaryOperator.CONTAINS, valueNode)),
        '_contains': (fieldNode, valueNode) => new BinaryOperationQueryNode(fieldNode, BinaryOperator.CONTAINS, valueNode),
        '_not_starts_with': (fieldNode, valueNode) => not(new BinaryOperationQueryNode(fieldNode, BinaryOperator.STARTS_WITH, valueNode)),
        '_starts_with': (fieldNode, valueNode) => new BinaryOperationQueryNode(fieldNode, BinaryOperator.STARTS_WITH, valueNode),
        '_not_ends_with': (fieldNode, valueNode) => not(new BinaryOperationQueryNode(fieldNode, BinaryOperator.ENDS_WITH, valueNode)),
        '_ends_with': (fieldNode, valueNode) => new BinaryOperationQueryNode(fieldNode, BinaryOperator.ENDS_WITH, valueNode),
        '': (fieldNode, valueNode) => new BinaryOperationQueryNode(fieldNode, BinaryOperator.EQUAL, valueNode)
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

function getOrderByClauseNames(orderBy: any, objectType: GraphQLObjectType, listFieldRequest: FieldRequest): string[] {
    const clauseNames = !orderBy ? [] : isArray(orderBy) ? orderBy : [orderBy];

    // if pagination is enabled on a list of entities, make sure we filter after a unique key
    // TODO figure a way to do proper pagination on a simple list of embedded objects
    if ('first' in listFieldRequest.args && 'id' in objectType.getFields()) {
        const includesID = clauseNames.some(name => name == 'id_ASC' || name == 'id_DESC');
        if (!includesID) {
            return [...orderBy, 'id_ASC'];
        }
        return clauseNames;
    }
    return clauseNames;
}

function createOrderSpecification(orderByArg: any, objectType: GraphQLObjectType, listFieldRequest: FieldRequest) {
    const clauseNames = getOrderByClauseNames(orderByArg, objectType, listFieldRequest);
    const clauses = clauseNames.map(name => {
        let dir = name.endsWith('_DESC') ? OrderDirection.DESCENDING : OrderDirection.ASCENDING;
        const fieldName = getFieldFromOrderByClause(name);
        const fieldQuery = createScalarFieldValueNode(objectType, fieldName);
        return new OrderClause(fieldQuery, dir);
    });
    return new OrderSpecification(clauses);
}

function createScalarFieldValueNode(objectType: GraphQLObjectType, fieldName: string, contextNode: QueryNode = new ContextQueryNode()): QueryNode {
    const field = objectType.getFields()[fieldName];
    if (!field || !(field.type instanceof GraphQLScalarType)) {
        throw new Error(`Field ${fieldName} is not a field of ${objectType.name} with scalar type`);
    }
    return new FieldQueryNode(contextNode, field);
}

/**
 * Creates a query node for the cursor of itemNode when being requested in listFieldRequest
 * @param {FieldRequest} listFieldRequest
 * @param {QueryNode} itemNode
 */
function createCursorQueryNode(listFieldRequest: FieldRequest, itemNode: QueryNode) {
    if (!listFieldRequest || !isListType(listFieldRequest.field.type)) {
        return new NullQueryNode(); // not in context of a list
    }

    const objectType = getNamedType(listFieldRequest.field.type) as GraphQLObjectType;
    const clauses = getOrderByClauseNames(listFieldRequest.args['orderBy'], objectType, listFieldRequest);
    const fieldNamess = clauses.map(clause => getFieldFromOrderByClause(clause)).sort();
    const objectNode = new ObjectQueryNode(fieldNamess.map( fieldName =>
        new PropertySpecification(fieldName, createScalarFieldValueNode(objectType, fieldName))));
    return new UnaryOperationQueryNode(objectNode, UnaryOperator.JSON_STRINGIFY);
}

function getFieldFromOrderByClause(clause: string): string {
    if (clause.endsWith('_ASC')) {
        return clause.substr(0, clause.length - '_ASC'.length);
    }
    if (clause.endsWith('_DESC')) {
        return clause.substr(0, clause.length - '_DESC'.length);
    }
    return clause;
}

function createPaginationFilterNode(afterArg: any, orderSpecification: OrderSpecification) {
    if (!afterArg) {
        return new ConstBoolQueryNode(true);
    }

    let cursorObj: any;
    try {
        cursorObj = JSON.parse(afterArg);
        if (typeof cursorObj != 'object') {
            throw new Error('The JSON value provided as "after" argument is not an object');
        }
    } catch (e) {
        throw new Error(`Invalid cursor ${JSON.stringify(afterArg)} supplied to "after": ${e.message}`);
    }

    // Make sure we only select items after the cursor
    // Thus, we need to implement the 'comparator' based on the order-by-specification
    // Haskell-like pseudo-code because it's easier ;-)
    // orderByToFilter :: Clause[] -> FilterNode:
    // orderByToFilter([{field, ASC}, ...tail]) =
    //   (context[clause.field] > cursor[clause.field] || (context[clause.field] == cursor[clause.field] && orderByToFilter(tail))
    // orderByToFilter([{field, DESC}, ...tail]) =
    //   (context[clause.field] < cursor[clause.field] || (context[clause.field] == cursor[clause.field] && orderByToFilter(tail))
    // orderByToFilter([]) = FALSE # arbitrary; if order is absolute, this case should never occur
    function orderByToFilter(clauses: OrderClause[]): QueryNode {
        if (clauses.length == 0) {
            return new ConstBoolQueryNode(false);
        }

        const clause = clauses[0];
        let cursorValue;
        if (clause.valueNode instanceof FieldQueryNode) {
            cursorValue = cursorObj[clause.valueNode.field.name];
        } else if (clause.valueNode instanceof LiteralQueryNode) {
            cursorValue = clause.valueNode.value;
        } else {
            throw new Error('Pagination is not supported in combination with order-by clauses of type ' + (<any>clause.valueNode).constructor.name);
        }

        const operator = clause.direction == OrderDirection.ASCENDING ? BinaryOperator.GREATER_THAN : BinaryOperator.LESS_THAN;
        return new BinaryOperationQueryNode(
            new BinaryOperationQueryNode(clause.valueNode, operator, new LiteralQueryNode(cursorValue)),
            BinaryOperator.OR,
            new BinaryOperationQueryNode(
                new BinaryOperationQueryNode(clause.valueNode, BinaryOperator.EQUAL, new LiteralQueryNode(cursorValue)),
                BinaryOperator.AND,
                orderByToFilter(clauses.slice(1))
            )
        );
    }

    return orderByToFilter(orderSpecification.clauses);
}

function createCreateEntityQueryNode(fieldRequest: FieldRequest, fieldRequestStack: FieldRequest[]): QueryNode {
    const entityName = fieldRequest.fieldName.substr('create'.length);
    const entityType = fieldRequest.schema.getTypeMap()[entityName];
    if (!entityType || !(entityType instanceof GraphQLObjectType)) {
        throw new Error(`Object type ${entityName} not found but needed for field ${fieldRequest.fieldName}`);
    }
    const input = fieldRequest.args['input'];
    const objectNode = new LiteralQueryNode(input);
    const createEntityNode = new CreateEntityQueryNode(entityType, objectNode);
    const resultNode = createObjectNode(fieldRequest.selectionSet, new ContextQueryNode(), fieldRequestStack);
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
