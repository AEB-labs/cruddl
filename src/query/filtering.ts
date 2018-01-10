import { getNamedType, GraphQLEnumType, GraphQLObjectType, GraphQLScalarType } from 'graphql';
import {
    BasicType, BinaryOperationQueryNode, BinaryOperator, ConstBoolQueryNode, CountQueryNode, LiteralQueryNode,
    QueryNode, TransformListQueryNode, TypeCheckQueryNode, UnaryOperationQueryNode, UnaryOperator, VariableQueryNode
} from './definition';
import { isArray } from 'util';
import {
    ARGUMENT_AND, ARGUMENT_OR, INPUT_FIELD_CONTAINS, INPUT_FIELD_ENDS_WITH, INPUT_FIELD_EQUAL, INPUT_FIELD_GT,
    INPUT_FIELD_GTE, INPUT_FIELD_IN, INPUT_FIELD_LT, INPUT_FIELD_LTE, INPUT_FIELD_NOT, INPUT_FIELD_NOT_CONTAINS,
    INPUT_FIELD_NOT_ENDS_WITH, INPUT_FIELD_NOT_IN, INPUT_FIELD_NOT_STARTS_WITH, INPUT_FIELD_SEPARATOR,
    INPUT_FIELD_STARTS_WITH
} from '../schema/schema-defaults';
import { createListFieldValueNode, createNonListFieldValueNode, createScalarFieldValueNode } from './fields';
import { assert, decapitalize } from '../utils/utils';
import { QueryTreeContext } from './query-tree-base';

export function createFilterNode(filterArg: any, objectType: GraphQLObjectType|GraphQLScalarType|GraphQLEnumType, contextNode: QueryNode, context: QueryTreeContext): QueryNode {
    if (!filterArg || !Object.keys(filterArg).length) {
        return new ConstBoolQueryNode(true);
    }
    let filterNode: QueryNode | undefined = undefined;
    for (const key of Object.getOwnPropertyNames(filterArg)) {
        let newClause;
        if (objectType instanceof GraphQLObjectType) {
            newClause = getObjectTypeFilterClauseNode(key, filterArg[key], contextNode, objectType, context);
        } else {
            // handle scalars and enums
            newClause = getScalarTypeFilterClauseNode(key, filterArg[key], contextNode);
        }

        if (filterNode && newClause) {
            filterNode = new BinaryOperationQueryNode(filterNode, BinaryOperator.AND, newClause);
        } else {
            filterNode = newClause;
        }
    }
    return filterNode || new ConstBoolQueryNode(true);
}

const filterOperators: { [suffix: string]: (fieldNode: QueryNode, valueNode: QueryNode) => QueryNode } = {
    // not's before the normal fields because they need to be matched first in the suffix-matching algorithm
    [INPUT_FIELD_EQUAL]: (fieldNode, valueNode) => new BinaryOperationQueryNode(fieldNode, BinaryOperator.EQUAL, valueNode),
    [INPUT_FIELD_NOT]: (fieldNode, valueNode) => new BinaryOperationQueryNode(fieldNode, BinaryOperator.UNEQUAL, valueNode),
    [INPUT_FIELD_LT]: (fieldNode, valueNode) => new BinaryOperationQueryNode(fieldNode, BinaryOperator.LESS_THAN, valueNode),
    [INPUT_FIELD_LTE]: (fieldNode, valueNode) => new BinaryOperationQueryNode(fieldNode, BinaryOperator.LESS_THAN_OR_EQUAL, valueNode),
    [INPUT_FIELD_GT]: (fieldNode, valueNode) => new BinaryOperationQueryNode(fieldNode, BinaryOperator.GREATER_THAN, valueNode),
    [INPUT_FIELD_GTE]: (fieldNode, valueNode) => new BinaryOperationQueryNode(fieldNode, BinaryOperator.GREATER_THAN_OR_EQUAL, valueNode),
    [INPUT_FIELD_NOT_IN]: (fieldNode, valueNode) => not(new BinaryOperationQueryNode(fieldNode, BinaryOperator.IN, valueNode)),
    [INPUT_FIELD_IN]: (fieldNode, valueNode) => new BinaryOperationQueryNode(fieldNode, BinaryOperator.IN, valueNode),
    [INPUT_FIELD_NOT_CONTAINS]: (fieldNode, valueNode) => not(new BinaryOperationQueryNode(fieldNode, BinaryOperator.CONTAINS, valueNode)),
    [INPUT_FIELD_CONTAINS]: (fieldNode, valueNode) => new BinaryOperationQueryNode(fieldNode, BinaryOperator.CONTAINS, valueNode),
    [INPUT_FIELD_NOT_STARTS_WITH]: (fieldNode, valueNode) => not(new BinaryOperationQueryNode(fieldNode, BinaryOperator.STARTS_WITH, valueNode)),
    [INPUT_FIELD_STARTS_WITH]: (fieldNode, valueNode) => new BinaryOperationQueryNode(fieldNode, BinaryOperator.STARTS_WITH, valueNode),
    [INPUT_FIELD_NOT_ENDS_WITH]: (fieldNode, valueNode) => not(new BinaryOperationQueryNode(fieldNode, BinaryOperator.ENDS_WITH, valueNode)),
    [INPUT_FIELD_ENDS_WITH]: (fieldNode, valueNode) => new BinaryOperationQueryNode(fieldNode, BinaryOperator.ENDS_WITH, valueNode)
};

function getObjectTypeFilterClauseNode(key: string, value: any, contextNode: QueryNode, objectType: GraphQLObjectType, context: QueryTreeContext): QueryNode {
    // special nodes
    switch (key) {
        case ARGUMENT_AND:
            if (!isArray(value) || !value.length) {
                return new ConstBoolQueryNode(true);
            }
            return value
                .map(itemValue => createFilterNode(itemValue, objectType, contextNode, context))
                .reduce((prev, current) => new BinaryOperationQueryNode(prev, BinaryOperator.AND, current));
        case ARGUMENT_OR:
            if (!isArray(value)) {
                return new ConstBoolQueryNode(true); // regard as omitted
            }
            if (!value.length) {
                return new ConstBoolQueryNode(false); // proper boolean logic (neutral element of OR is FALSE)
            }
            return value
                .map(itemValue => createFilterNode(itemValue, objectType, contextNode, context))
                .reduce((prev, current) => new BinaryOperationQueryNode(prev, BinaryOperator.OR, current));
    }

    // check for _some, _every, _none filters
    const quantifierData = captureListQuantifiers(key);
    if (quantifierData) {
        let { fieldKey, quantifier } = quantifierData;
        const field = objectType.getFields()[fieldKey];
        assert(!!field, 'Expected field to be defined');
        const rawFieldType = getNamedType(field.type);

        const listNode = createListFieldValueNode({
            objectNode: contextNode,
            parentType: objectType,
            field: field
        });

        if (quantifier === 'every') {
            // every(P(x)) === none(!P(x))
            // so just flip it
            quantifier = 'none';
            value = { not: value }
        }
        const binaryOp = quantifier === 'some' ? BinaryOperator.GREATER_THAN : BinaryOperator.EQUAL;
        const itemVarNode = new VariableQueryNode(decapitalize(rawFieldType.name));
        const filteredListNode = new TransformListQueryNode({
            listNode,
            filterNode: createFilterNode(value, rawFieldType as GraphQLObjectType|GraphQLScalarType|GraphQLEnumType, itemVarNode, context),
            itemVariable: itemVarNode
        });

        return new BinaryOperationQueryNode(new CountQueryNode(filteredListNode), binaryOp, new LiteralQueryNode(0));
    }

    // check for filters in embedded objects
    const field = objectType.getFields()[key];
    const rawFieldType = field ? getNamedType(field.type) : undefined;
    if (field) {
        if (rawFieldType instanceof GraphQLObjectType) {
            if (value === null) {
                // don't check inside the object but check if the object an object anyway.
                const fieldNode = createNonListFieldValueNode({
                    parentType: objectType,
                    field,
                    objectNode: contextNode,
                    context
                });
                const isObjectNode = new TypeCheckQueryNode(fieldNode, BasicType.OBJECT);
                return new UnaryOperationQueryNode(isObjectNode, UnaryOperator.NOT);
            }

            // possibly complex field lookup (references, relations)
            return createNonListFieldValueNode({
                field,
                parentType: objectType,
                objectNode: contextNode,
                innerNodeFn: (valueNode: QueryNode) => {
                    // this function maps the object (field value, referenced object, related object) to the filter condition
                    const isObjectNode = new TypeCheckQueryNode(valueNode, BasicType.OBJECT);
                    const rawFilterNode = createFilterNode(value, rawFieldType, valueNode, context);
                    if (!rawFilterNode) {
                        return isObjectNode; // an empty filter only checks if the object is present and a real object
                    }
                    // make sure to check for object type before doing the filter
                    return new BinaryOperationQueryNode(isObjectNode, BinaryOperator.AND, rawFilterNode);
                },
                context
            });
        } else {
            // simple scalar equality filter
            const fieldNode = createScalarFieldValueNode(objectType, key, contextNode, context);
            const valueNode = new LiteralQueryNode(value);
            return new BinaryOperationQueryNode(fieldNode, BinaryOperator.EQUAL, valueNode);
        }
    }

    // operator on scalar
    for (const operatorKey in filterOperators) {
        const suffix = INPUT_FIELD_SEPARATOR + operatorKey;
        if (key.endsWith(suffix)) {
            const fieldName = key.substr(0, key.length - suffix.length);
            const fieldNode = createScalarFieldValueNode(objectType, fieldName, contextNode, context);
            const valueNode =  new LiteralQueryNode(value);
            return filterOperators[operatorKey](fieldNode, valueNode);
        }
    }

    throw new Error(`Invalid filter field: ${key}`);
}

function captureListQuantifiers(key: string) {
    const data = key.match(/^(.+)_(some|every|none)$/);
    if (data == undefined) {
        return undefined;
    }
    return {
        fieldKey: data[1],
        quantifier: data[2]
    }
}

function not(value: QueryNode) {
    return new UnaryOperationQueryNode(value, UnaryOperator.NOT);
}

function getScalarTypeFilterClauseNode(key: string, value: any, contextNode: QueryNode): QueryNode {
    const valueNode =  new LiteralQueryNode(value);
    return filterOperators[key](contextNode, valueNode);
}
