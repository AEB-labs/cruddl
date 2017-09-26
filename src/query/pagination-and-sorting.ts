import { FieldRequest } from '../graphql/query-distiller';
import { getNamedType, GraphQLObjectType, GraphQLScalarType } from 'graphql';
import {
    BinaryOperationQueryNode, BinaryOperator, ConstBoolQueryNode, ContextQueryNode, FieldQueryNode, LiteralQueryNode,
    NullQueryNode,
    ObjectQueryNode, OrderClause, OrderDirection, OrderSpecification, PropertySpecification, QueryNode,
    UnaryOperationQueryNode, UnaryOperator
} from './definition';
import { isArray } from 'util';
import { isListType } from '../graphql/schema-utils';

export function createPaginationFilterNode(afterArg: any, orderSpecification: OrderSpecification) {
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

export function createOrderSpecification(orderByArg: any, objectType: GraphQLObjectType, listFieldRequest: FieldRequest) {
    const clauseNames = getOrderByClauseNames(orderByArg, objectType, listFieldRequest);
    const clauses = clauseNames.map(name => {
        let dir = name.endsWith('_DESC') ? OrderDirection.DESCENDING : OrderDirection.ASCENDING;
        const fieldName = getFieldFromOrderByClause(name);
        const fieldQuery = createScalarFieldValueNode(objectType, fieldName);
        return new OrderClause(fieldQuery, dir);
    });
    return new OrderSpecification(clauses);
}


/**
 * Creates a query node for the cursor of itemNode when being requested in listFieldRequest
 * @param {FieldRequest} listFieldRequest
 * @param {QueryNode} itemNode
 */
export function createCursorQueryNode(listFieldRequest: FieldRequest, itemNode: QueryNode) {
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

function createScalarFieldValueNode(objectType: GraphQLObjectType, fieldName: string, contextNode: QueryNode = new ContextQueryNode()): QueryNode {
    const field = objectType.getFields()[fieldName];
    if (!field || !(field.type instanceof GraphQLScalarType)) {
        throw new Error(`Field ${fieldName} is not a field of ${objectType.name} with scalar type`);
    }
    return new FieldQueryNode(contextNode, field);
}
