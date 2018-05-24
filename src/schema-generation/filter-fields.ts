import { GraphQLBoolean, GraphQLFloat, GraphQLID, GraphQLInputType, GraphQLInt, GraphQLString } from 'graphql';
import { Field } from '../model/implementation/index';
import { EnumType, ScalarType } from '../model/index';
import {
    BinaryOperationQueryNode, BinaryOperator, CountQueryNode, TransformListQueryNode, UnaryOperationQueryNode,
    UnaryOperator, VariableQueryNode
} from '../query-tree';
import { FieldQueryNode, LiteralQueryNode, QueryNode } from '../query-tree/index';
import { GraphQLDateTime } from '../schema/scalars/date-time';
import {
    FILTER_ARG,
    INPUT_FIELD_CONTAINS, INPUT_FIELD_ENDS_WITH, INPUT_FIELD_EQUAL, INPUT_FIELD_EVERY, INPUT_FIELD_GT, INPUT_FIELD_GTE,
    INPUT_FIELD_IN,
    INPUT_FIELD_LT, INPUT_FIELD_LTE, INPUT_FIELD_NONE, INPUT_FIELD_NOT, INPUT_FIELD_NOT_CONTAINS,
    INPUT_FIELD_NOT_ENDS_WITH,
    INPUT_FIELD_NOT_IN, INPUT_FIELD_NOT_STARTS_WITH, INPUT_FIELD_SOME, INPUT_FIELD_STARTS_WITH, SCALAR_DATE, SCALAR_TIME
} from '../schema/schema-defaults';
import { AnyValue, decapitalize } from '../utils/utils';
import { FilterObjectType, FilterTypeGenerator } from './filter-type-generator';
import { buildSafeListQueryNode } from './query-node-utils';
import { TypedInputFieldBase, TypedInputObjectType } from './typed-input-object-type';


export interface FilterField extends TypedInputFieldBase<FilterField> {
    getFilterNode(sourceNode: QueryNode, filterValue: AnyValue): QueryNode
}

export interface ObjectFilterField extends FilterField {
    readonly inputType: FilterObjectType
    readonly field: Field
}

export interface ListFilterField extends FilterField {
    readonly inputType: FilterObjectType
    readonly field: Field
}

export interface ScalarOrEnumListItemFilterField extends FilterField {
    readonly inputType: GraphQLInputType;
    readonly itemType: ScalarType | EnumType
}

export interface AndFilterField extends FilterField {
    readonly inputType: FilterObjectType;
}

export interface OrFilterField extends FilterField {
    readonly inputType: FilterObjectType;
}

export class ScalarOrEnumFieldFilterField implements FilterField {
    constructor(
        public readonly field: Field,
        public readonly resolveOperator: (fieldNode: QueryNode, valueNode: QueryNode) => QueryNode,
        public readonly operatorPrefix: string | undefined,
        public readonly inputType: GraphQLInputType
    ) {
    }

    get name() {
        if (this.operatorPrefix == undefined) {
            return this.field.name;
        }
        return `${this.field.name}_${this.operatorPrefix}`;
    }

    getFilterNode(sourceNode: QueryNode, filterValue: AnyValue): QueryNode {
        // TODO relations etc.
        const valueNode = new FieldQueryNode(sourceNode, this.field);
        const literalNode = new LiteralQueryNode(filterValue);
        return this.resolveOperator(valueNode, literalNode);
    }
}

export class ScalarOrEnumFilterField implements FilterField {
    constructor(
        public readonly resolveOperator: (fieldNode: QueryNode, valueNode: QueryNode) => QueryNode,
        public readonly operatorName: string,
        public readonly inputType: GraphQLInputType
    ) {
    }

    get name() {
        return this.operatorName;
    }

    getFilterNode(sourceNode: QueryNode, filterValue: AnyValue): QueryNode {
        const literalNode = new LiteralQueryNode(filterValue);
        return this.resolveOperator(sourceNode, literalNode);
    }
}

export class QuantifierFilterField implements FilterField {
    constructor(
        public readonly field: Field,
        public readonly quantifierName: string,
        public readonly inputType: FilterObjectType,
    ) {
    }

    get name() {
        return `${this.field.name}_${this.quantifierName}`;
    }

    getFilterNode(sourceNode: QueryNode, filterValue: AnyValue): QueryNode {

        // every(P(x)) === none(!P(x))
        const quantifierForResult = this.quantifierName === INPUT_FIELD_EVERY ? INPUT_FIELD_NONE : this.quantifierName;
        const filterValueForResult = this.quantifierName === INPUT_FIELD_EVERY ? {not: filterValue} : filterValue;

        const listNode = buildSafeListQueryNode(sourceNode);
        const itemVariable = new VariableQueryNode(decapitalize(this.field.name));
        const filterNode = this.inputType.getFilterNode(sourceNode, filterValueForResult);
        const filteredListNode = new TransformListQueryNode({
            listNode,
            filterNode,
            itemVariable
        });

        return new BinaryOperationQueryNode(new CountQueryNode(filteredListNode),
            quantifierForResult === 'none' ? BinaryOperator.EQUAL : BinaryOperator.GREATER_THAN, new LiteralQueryNode(0));

    }
}

export class NestedObjectFilterField implements FilterField {
    constructor(
        public readonly field: Field,
        public readonly inputType: FilterObjectType
    ) {
    }

    get name() {
        return this.field.name;
    }

    getFilterNode(sourceNode: QueryNode, filterValue: AnyValue): QueryNode {
        return this.inputType.getFilterNode(sourceNode, filterValue);
    }
}

export const FILTER_OPERATORS: { [suffix: string]: (fieldNode: QueryNode, valueNode: QueryNode) => QueryNode } = {
    // not's before the normal fields because they need to be matched first in the suffix-matching algorithm
    [INPUT_FIELD_EQUAL]: binaryOp(BinaryOperator.EQUAL),
    [INPUT_FIELD_NOT]: binaryOp( BinaryOperator.UNEQUAL),
    [INPUT_FIELD_LT]: binaryOp( BinaryOperator.LESS_THAN),
    [INPUT_FIELD_LTE]: binaryOp( BinaryOperator.LESS_THAN_OR_EQUAL),
    [INPUT_FIELD_GT]: binaryOp( BinaryOperator.GREATER_THAN),
    [INPUT_FIELD_GTE]: binaryOp( BinaryOperator.GREATER_THAN_OR_EQUAL),
    [INPUT_FIELD_NOT_IN]: binaryNotOp(BinaryOperator.IN),
    [INPUT_FIELD_IN]: binaryOp( BinaryOperator.IN),
    [INPUT_FIELD_NOT_CONTAINS]: binaryNotOp( BinaryOperator.CONTAINS),
    [INPUT_FIELD_CONTAINS]: binaryOp( BinaryOperator.CONTAINS),
    [INPUT_FIELD_NOT_STARTS_WITH]: binaryNotOp( BinaryOperator.STARTS_WITH),
    [INPUT_FIELD_STARTS_WITH]: binaryOp( BinaryOperator.STARTS_WITH),
    [INPUT_FIELD_NOT_ENDS_WITH]: binaryNotOp( BinaryOperator.ENDS_WITH),
    [INPUT_FIELD_ENDS_WITH]: binaryOp( BinaryOperator.ENDS_WITH)
};

export const QUANTIFIERS = [INPUT_FIELD_SOME, INPUT_FIELD_EVERY, INPUT_FIELD_NONE];

export function not(value: QueryNode): QueryNode {
    return new UnaryOperationQueryNode(value, UnaryOperator.NOT);
}

export const and = binaryOp(BinaryOperator.AND);

export function binaryOp(op: BinaryOperator) {
    return (lhs: QueryNode, rhs: QueryNode) => new BinaryOperationQueryNode(lhs, op, rhs);
}

export function binaryNotOp(op: BinaryOperator) {
    return (lhs: QueryNode, rhs: QueryNode) => not(new BinaryOperationQueryNode(lhs, op, rhs));
}

export const STRING_FILTER_FIELDS = [INPUT_FIELD_EQUAL, INPUT_FIELD_NOT, INPUT_FIELD_IN, INPUT_FIELD_NOT_IN, INPUT_FIELD_LT,
    INPUT_FIELD_LTE, INPUT_FIELD_GT,INPUT_FIELD_GTE, INPUT_FIELD_CONTAINS, INPUT_FIELD_NOT_CONTAINS,
    INPUT_FIELD_STARTS_WITH, INPUT_FIELD_NOT_STARTS_WITH, INPUT_FIELD_ENDS_WITH, INPUT_FIELD_NOT_ENDS_WITH
];

export const NUMERIC_FILTER_FIELDS = [
    INPUT_FIELD_EQUAL, INPUT_FIELD_NOT, INPUT_FIELD_IN, INPUT_FIELD_NOT_IN,
    INPUT_FIELD_LT, INPUT_FIELD_LTE, INPUT_FIELD_GT, INPUT_FIELD_GTE,
];

export const FILTER_FIELDS_BY_TYPE: {[name: string]: string[]} = {
    [GraphQLString.name]: STRING_FILTER_FIELDS,
    [GraphQLID.name]: NUMERIC_FILTER_FIELDS,
    [GraphQLInt.name]: NUMERIC_FILTER_FIELDS,
    [GraphQLFloat.name]: NUMERIC_FILTER_FIELDS,
    [GraphQLDateTime.name]: NUMERIC_FILTER_FIELDS,
    [SCALAR_DATE]: NUMERIC_FILTER_FIELDS,
    [SCALAR_TIME]: NUMERIC_FILTER_FIELDS,
    [GraphQLBoolean.name]: [ INPUT_FIELD_EQUAL, INPUT_FIELD_NOT],
};