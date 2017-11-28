import {getNamedType, GraphQLEnumType, GraphQLObjectType, GraphQLScalarType} from 'graphql';
import {
    BasicType,
    BinaryOperationQueryNode,
    BinaryOperator,
    ConstBoolQueryNode,
    CountQueryNode,
    FieldQueryNode,
    FollowEdgeQueryNode,
    LiteralQueryNode,
    QueryNode,
    TransformListQueryNode,
    TypeCheckQueryNode,
    UnaryOperationQueryNode,
    UnaryOperator,
    VariableQueryNode
} from './definition';
import {isArray} from 'util';
import {ARGUMENT_AND, ARGUMENT_OR} from '../schema/schema-defaults';
import {createNonListFieldValueNode, createScalarFieldValueNode} from './fields';
import {decapitalize, invariant} from "../utils/utils";
import {isReferenceField, isRelationField} from "../schema/schema-utils";
import {getEdgeType} from "../schema/edges";
import {createSafeListQueryNode} from "./queries";

export function createFilterNode(filterArg: any, objectType: GraphQLObjectType|GraphQLScalarType|GraphQLEnumType, contextNode: QueryNode): QueryNode {
    if (!filterArg || !Object.keys(filterArg).length) {
        return new ConstBoolQueryNode(true);
    }
    let filterNode: QueryNode | undefined = undefined;
    for (const key of Object.getOwnPropertyNames(filterArg)) {
        let newClause;
        if (objectType instanceof GraphQLObjectType) {
            newClause = getObjectTypeFilterClauseNode(key, filterArg[key], contextNode, objectType);
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

function getObjectTypeFilterClauseNode(key: string, value: any, contextNode: QueryNode, objectType: GraphQLObjectType): QueryNode {
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

    // check for _some, _every, _none filters
    const quantifierData = captureListQuantifiers(key);
    if (quantifierData) {
        let { fieldKey, quantifier } = quantifierData;
        const field = objectType.getFields()[fieldKey];
        invariant(!field, 'Expected field to be defined');
        const rawFieldType= getNamedType(field.type);
        // get source
        let quantifiedList: QueryNode;
        if (isRelationField(field)) {
            const edgeType = getEdgeType(objectType, field);
            quantifiedList = new FollowEdgeQueryNode(edgeType, contextNode, edgeType.getRelationFieldEdgeSide(field));
        } else {
            invariant(isReferenceField(field), 'Lists of references are not supported, yet');
            quantifiedList = createSafeListQueryNode(new FieldQueryNode(contextNode, field));
        }
        if (quantifier === 'every') {
            // every(P(x)) === none(!P(x))
            // so just flip it
            quantifier = 'none';
            value = { not: value }
        }
        const binaryOp = quantifier === 'some' ? BinaryOperator.GREATER_THAN : BinaryOperator.EQUAL;
        const itemVarNode = new VariableQueryNode(decapitalize(rawFieldType.name));
        quantifiedList = new TransformListQueryNode({listNode: quantifiedList, filterNode: createFilterNode(value, rawFieldType as GraphQLObjectType, itemVarNode), itemVariable: itemVarNode});

        return new BinaryOperationQueryNode(new CountQueryNode(quantifiedList), binaryOp, new LiteralQueryNode(0));
    }


    // check for filters in embedded objects
    const field = objectType.getFields()[key];
    const rawFieldType = field ? getNamedType(field.type) : undefined;
    if (field && rawFieldType instanceof GraphQLObjectType) {
        // possibly complex field lookup (references, relations)
        return createNonListFieldValueNode({
            field,
            parentType: objectType,
            objectNode: contextNode,
            innerNodeFn: (valueNode: QueryNode) => {
                // this function maps the object (field value, referenced object, related object) to the filter condition
                const isObjectNode = new TypeCheckQueryNode(valueNode, BasicType.OBJECT);
                const rawFilterNode = createFilterNode(value, rawFieldType, valueNode);
                if (!rawFilterNode) {
                    return isObjectNode; // an empty filter only checks if the object is present and a real object
                }
                // make sure to check for object type before doing the filter
                return new BinaryOperationQueryNode(isObjectNode, BinaryOperator.AND, rawFilterNode);
            }
        });
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
    const variations: { [suffix: string]: (fieldNode: QueryNode, valueNode: QueryNode) => QueryNode } = {
        'equal': (fieldNode, valueNode) => new BinaryOperationQueryNode(fieldNode, BinaryOperator.EQUAL, valueNode),
        'not': (fieldNode, valueNode) => new BinaryOperationQueryNode(fieldNode, BinaryOperator.UNEQUAL, valueNode),
        'lt': (fieldNode, valueNode) => new BinaryOperationQueryNode(fieldNode, BinaryOperator.LESS_THAN, valueNode),
        'lte': (fieldNode, valueNode) => new BinaryOperationQueryNode(fieldNode, BinaryOperator.LESS_THAN_OR_EQUAL, valueNode),
        'gt': (fieldNode, valueNode) => new BinaryOperationQueryNode(fieldNode, BinaryOperator.GREATER_THAN, valueNode),
        'gte': (fieldNode, valueNode) => new BinaryOperationQueryNode(fieldNode, BinaryOperator.GREATER_THAN_OR_EQUAL, valueNode),
        'not_in': (fieldNode, valueNode) => not(new BinaryOperationQueryNode(fieldNode, BinaryOperator.GREATER_THAN_OR_EQUAL, valueNode)),
        'in': (fieldNode, valueNode) => new BinaryOperationQueryNode(fieldNode, BinaryOperator.IN, valueNode),
        'not_contains': (fieldNode, valueNode) => not(new BinaryOperationQueryNode(fieldNode, BinaryOperator.CONTAINS, valueNode)),
        'contains': (fieldNode, valueNode) => new BinaryOperationQueryNode(fieldNode, BinaryOperator.CONTAINS, valueNode),
        'not_starts_with': (fieldNode, valueNode) => not(new BinaryOperationQueryNode(fieldNode, BinaryOperator.STARTS_WITH, valueNode)),
        'starts_with': (fieldNode, valueNode) => new BinaryOperationQueryNode(fieldNode, BinaryOperator.STARTS_WITH, valueNode),
        'not_ends_with': (fieldNode, valueNode) => not(new BinaryOperationQueryNode(fieldNode, BinaryOperator.ENDS_WITH, valueNode)),
        'ends_with': (fieldNode, valueNode) => new BinaryOperationQueryNode(fieldNode, BinaryOperator.ENDS_WITH, valueNode)
    };
    const valueNode =  new LiteralQueryNode(value);
    return variations[key](contextNode, valueNode);
}
