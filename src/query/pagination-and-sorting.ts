import { FieldRequest } from '../graphql/query-distiller';
import { getNamedType, GraphQLField, GraphQLObjectType, GraphQLType } from 'graphql';
import {
    BinaryOperationQueryNode, BinaryOperator, ConstBoolQueryNode, LiteralQueryNode, NullQueryNode, ObjectQueryNode,
    OrderClause, OrderDirection, OrderSpecification, PropertySpecification, QueryNode, UnaryOperationQueryNode,
    UnaryOperator
} from './definition';
import { isArray } from 'util';
import { isListType } from '../graphql/schema-utils';
import {
    AFTER_ARG, CURSOR_FIELD, ID_FIELD, ORDER_BY_ARG, ORDER_BY_ASC_SUFFIX, ORDER_BY_DESC_SUFFIX
} from '../schema/schema-defaults';
import { sortedByAsc, sortedByDesc } from '../graphql/names';
import { createNonListFieldValueNode } from './fields';
import { ObjectType, Type } from '../model/implementation';

export function createPaginationFilterNode(objectType: ObjectType, listFieldRequest: FieldRequest, itemNode: QueryNode) {
    const afterArg = listFieldRequest.args[AFTER_ARG];
    if (!afterArg) {
        return new ConstBoolQueryNode(true);
    }

    let cursorObj: any;
    try {
        cursorObj = JSON.parse(afterArg);
        if (typeof cursorObj != 'object' || cursorObj === null) {
            throw new Error('The JSON value provided as "after" argument is not an object');
        }
    } catch (e) {
        throw new Error(`Invalid cursor ${JSON.stringify(afterArg)} supplied to "after": ${e.message}`);
    }

    // Make sure we only select items after the cursor
    // Thus, we need to implement the 'comparator' based on the order-by-specification
    // Haskell-like pseudo-code because it's easier ;-)
    // filterForClause :: Clause[] -> FilterNode:
    // filterForClause([{field, ASC}, ...tail]) =
    //   (context[clause.field] > cursor[clause.field] || (context[clause.field] == cursor[clause.field] && filterForClause(tail))
    // filterForClause([{field, DESC}, ...tail]) =
    //   (context[clause.field] < cursor[clause.field] || (context[clause.field] == cursor[clause.field] && filterForClause(tail))
    // filterForClause([]) = FALSE # arbitrary; if order is absolute, this case should never occur
    function filterForClause(clauses: {fieldPath: string, valueNode: QueryNode, direction: OrderDirection}[]): QueryNode {
        if (clauses.length == 0) {
            return new ConstBoolQueryNode(false);
        }

        const clause = clauses[0];
        const cursorValue = cursorObj[clause.fieldPath];

        const operator = clause.direction == OrderDirection.ASCENDING ? BinaryOperator.GREATER_THAN : BinaryOperator.LESS_THAN;
        return new BinaryOperationQueryNode(
            new BinaryOperationQueryNode(clause.valueNode, operator, new LiteralQueryNode(cursorValue)),
            BinaryOperator.OR,
            new BinaryOperationQueryNode(
                new BinaryOperationQueryNode(clause.valueNode, BinaryOperator.EQUAL, new LiteralQueryNode(cursorValue)),
                BinaryOperator.AND,
                filterForClause(clauses.slice(1))
            )
        );
    }

    const clauseNames = getOrderByClauseNames(objectType, listFieldRequest);
    const clauses = clauseNames.map(name => {
        let direction = name.endsWith(ORDER_BY_DESC_SUFFIX) ? OrderDirection.DESCENDING : OrderDirection.ASCENDING;
        const fieldPath = getFieldPathFromOrderByClause(name);
        const valueNode = createScalarFieldPathValueNode(objectType, fieldPath, itemNode);
        return {
            fieldPath,
            direction,
            valueNode
        };
    });
    return filterForClause(clauses);
}

export function createOrderSpecification(objectType: ObjectType, listFieldRequest: FieldRequest, itemNode: QueryNode) {
    const clauseNames = getOrderByClauseNames(objectType, listFieldRequest);
    const clauses = clauseNames.map(name => {
        let dir = name.endsWith(ORDER_BY_DESC_SUFFIX) ? OrderDirection.DESCENDING : OrderDirection.ASCENDING;
        const fieldPath = getFieldPathFromOrderByClause(name);
        const fieldQuery = createScalarFieldPathValueNode(objectType, fieldPath, itemNode);
        return new OrderClause(fieldQuery, dir);
    });
    return new OrderSpecification(clauses);
}


/**
 * Creates a query node for the cursor of itemNode when being requested in listFieldRequest
 * @param {FieldRequest} listFieldRequest
 * @param {QueryNode} itemNode
 */
export function createCursorQueryNode(listFieldRequest: FieldRequest, itemNode: QueryNode, itemType: ObjectType) {
    if (!listFieldRequest || !isListType(listFieldRequest.field.type)) {
        return new NullQueryNode(); // not in context of a list
    }

    const clauses = getOrderByClauseNames(itemType, listFieldRequest);
    const fieldPaths = clauses.map(clause => getFieldPathFromOrderByClause(clause)).sort();
    const objectNode = new ObjectQueryNode(fieldPaths.map( fieldPath =>
        new PropertySpecification(fieldPath, createScalarFieldPathValueNode(itemType, fieldPath, itemNode))));
    return new UnaryOperationQueryNode(objectNode, UnaryOperator.JSON_STRINGIFY);
}

function getFieldPathFromOrderByClause(clause: string): string {
    if (clause.endsWith(ORDER_BY_ASC_SUFFIX)) {
        return clause.substr(0, clause.length - ORDER_BY_ASC_SUFFIX.length);
    }
    if (clause.endsWith(ORDER_BY_DESC_SUFFIX)) {
        return clause.substr(0, clause.length - ORDER_BY_DESC_SUFFIX.length);
    }
    return clause;
}

function createScalarFieldPathValueNode(baseType: ObjectType, fieldPath: string, baseNode: QueryNode): QueryNode {
    const segments = fieldPath.split('_');
    if (!segments.length) {
        throw new Error(`Invalid field path: ${fieldPath}`);
    }
    let currentType: Type = baseType;
    let currentNode = baseNode;
    for (const fieldName of segments) {
        if (!currentType.isObjectType) {
            throw new Error(`Invalid field path on ${baseType.name}: ${fieldPath} (type ${currentType} does not have subfields`);
        }
        const field = currentType.getFieldOrThrow(fieldName);

        // we don't do type checks for object because in AQL, property lookups on non-objects yield NULL anyway
        // we might need to change this when targeting different data bases

        currentNode = createNonListFieldValueNode({
            field,
            parentType: currentType,
            objectNode: currentNode
        });

        currentType = field.type;
    }

    return currentNode;
}

function getOrderByClauseNames(objectType: ObjectType, listFieldRequest: FieldRequest): string[] {
    const orderBy = listFieldRequest.args[ORDER_BY_ARG];
    const clauseNames = !orderBy ? [] : isArray(orderBy) ? orderBy : [orderBy];

    // if pagination is enabled on a list of entities, make sure we filter after a unique key
    // TODO figure a way to do proper pagination on a simple list of embedded objects

    const isCursorRequested = listFieldRequest.selectionSet.some(sel => sel.fieldRequest.fieldName == CURSOR_FIELD);
    if (isCursorRequested && objectType.getField(ID_FIELD)) {
        const includesID = clauseNames.some(name => name == sortedByAsc(ID_FIELD) || name == sortedByDesc(ID_FIELD));
        if (!includesID) {
            return [...clauseNames, sortedByAsc(ID_FIELD)];
        }
        return clauseNames;
    }
    return clauseNames;
}
