import { getNamedType, GraphQLObjectType } from 'graphql';
import {
    BasicType, BinaryOperationQueryNode, BinaryOperator, ConstBoolQueryNode, FieldQueryNode, RootEntityIDQueryNode,
    LiteralQueryNode,
    QueryNode, TypeCheckQueryNode, UnaryOperationQueryNode, UnaryOperator
} from './definition';
import { isArray } from 'util';
import { ARGUMENT_AND, ARGUMENT_OR, ID_FIELD } from '../schema/schema-defaults';
import { isRootEntityType } from '../schema/schema-utils';
import { createScalarFieldValueNode } from './common';

export function createFilterNode(filterArg: any, objectType: GraphQLObjectType, contextNode: QueryNode): QueryNode {
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
        case ARGUMENT_AND:
            if (!isArray(value) || !value.length) {
                return new ConstBoolQueryNode(true);
            }
            return value
                .map(itemValue => createFilterNode(itemValue, objectType, contextNode))
                .reduce((prev, current) => new BinaryOperationQueryNode(prev, BinaryOperator.AND, current));
        case ARGUMENT_OR:
            if (!isArray(value)) {
                return new ConstBoolQueryNode(true); // regard as omitted
            }
            if (!value.length) {
                return new ConstBoolQueryNode(false); // proper boolean logic (neutral element of OR is FALSE)
            }
            return value
                .map(itemValue => createFilterNode(itemValue, objectType, contextNode))
                .reduce((prev, current) => new BinaryOperationQueryNode(prev, BinaryOperator.OR, current));
    }

    // check for filters in embedded objects
    const field = objectType.getFields()[key];
    const rawFieldType = field ? getNamedType(field.type) : undefined;
    if (field && rawFieldType instanceof GraphQLObjectType) {
        const fieldNode = new FieldQueryNode(contextNode, field);
        const isObjectNode = new TypeCheckQueryNode(fieldNode, BasicType.OBJECT);
        const rawFilterNode = createFilterNode(value, rawFieldType, fieldNode);
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
        // identifier cross reference: graphql/names.ts
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
            const fieldNode = createScalarFieldValueNode(objectType, fieldName, contextNode);
            const valueNode =  new LiteralQueryNode(value);
            return variations[suffix](fieldNode, valueNode);
        }
    }
    throw new Error(`Invalid filter field: ${key}`);
}