import {
    GraphQLBoolean, GraphQLEnumType, GraphQLFloat, GraphQLID, GraphQLInputType, GraphQLInt, GraphQLString
} from 'graphql';
import { Field } from '../../model';
import {
    BinaryOperationQueryNode, BinaryOperator, CountQueryNode, FieldQueryNode, LiteralQueryNode, QueryNode,
    TransformListQueryNode, UnaryOperationQueryNode, UnaryOperator, VariableQueryNode
} from '../../query-tree';
import { GraphQLDateTime } from '../../schema/scalars/date-time';
import {
    INPUT_FIELD_CONTAINS, INPUT_FIELD_ENDS_WITH, INPUT_FIELD_EQUAL, INPUT_FIELD_EVERY, INPUT_FIELD_GT, INPUT_FIELD_GTE,
    INPUT_FIELD_IN, INPUT_FIELD_LT, INPUT_FIELD_LTE, INPUT_FIELD_NONE, INPUT_FIELD_NOT, INPUT_FIELD_NOT_CONTAINS,
    INPUT_FIELD_NOT_ENDS_WITH, INPUT_FIELD_NOT_IN, INPUT_FIELD_NOT_STARTS_WITH, INPUT_FIELD_SOME,
    INPUT_FIELD_STARTS_WITH, SCALAR_DATE, SCALAR_TIME
} from '../../schema/schema-defaults';
import { AnyValue, decapitalize } from '../../utils/utils';
import { buildSafeListQueryNode } from '../query-node-utils';
import { TypedInputFieldBase } from '../typed-input-object-type';
import { FilterObjectType, FilterTypeGenerator } from './generator';


export interface FilterField extends TypedInputFieldBase<FilterField> {
    getFilterNode(sourceNode: QueryNode, filterValue: AnyValue): QueryNode
}

export class ScalarOrEnumFieldFilterField implements FilterField {
    constructor(
        public readonly field: Field,
        public readonly resolveOperator: (fieldNode: QueryNode, valueNode: QueryNode) => QueryNode,
        public readonly operatorPrefix: string | undefined,
        public readonly inputType: GraphQLInputType|FilterObjectType
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
        public readonly inputType: GraphQLInputType|GraphQLEnumType
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

export interface ListFilterField extends FilterField {
    readonly inputType: FilterObjectType
    readonly field: Field
}

