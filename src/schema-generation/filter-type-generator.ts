import { GraphQLInputType, GraphQLString, Thunk } from 'graphql';
import { flatMap } from 'lodash';
import memorize from 'memorize-decorator';
import { EnumType, Field, ObjectType, ScalarType } from '../model';
import {
    BinaryOperationQueryNode, BinaryOperator, ConstBoolQueryNode, FieldQueryNode, LiteralQueryNode, NullQueryNode,
    QueryNode,
    UnaryOperationQueryNode,
    UnaryOperator
} from '../query-tree';
import {
    INPUT_FIELD_CONTAINS, INPUT_FIELD_ENDS_WITH, INPUT_FIELD_EQUAL, INPUT_FIELD_GT, INPUT_FIELD_GTE, INPUT_FIELD_IN,
    INPUT_FIELD_LT, INPUT_FIELD_LTE, INPUT_FIELD_NOT, INPUT_FIELD_NOT_CONTAINS, INPUT_FIELD_NOT_ENDS_WITH,
    INPUT_FIELD_NOT_IN, INPUT_FIELD_NOT_STARTS_WITH, INPUT_FIELD_STARTS_WITH
} from '../schema/schema-defaults';
import { AnyValue, objectEntries } from '../utils/utils';
import { TypedInputFieldBase, TypedInputObjectType } from './typed-input-object-type';

export class FilterObjectType extends TypedInputObjectType<FilterField> {
    constructor(
        name: string,
        fields: Thunk<ReadonlyArray<FilterField>>
    ) {
        super(name, fields);
    }

    getFilterNode(sourceNode: QueryNode, filterValue: AnyValue): QueryNode {
        if (typeof filterValue !== 'object' || filterValue === null) {
            return new BinaryOperationQueryNode(sourceNode, BinaryOperator.EQUAL, NullQueryNode.NULL);
        }
        const filterNodes = objectEntries(filterValue)
            .map(([name, value]) => this.getFieldOrThrow(name).getFilterNode(sourceNode, value));
        return filterNodes.reduce(and, ConstBoolQueryNode.TRUE);
    }
}

export interface FilterField extends TypedInputFieldBase<FilterField> {
    getFilterNode(sourceNode: QueryNode, filterValue: AnyValue): QueryNode
}

export class ScalarOrEnumFilterField implements FilterField {
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

const filterOperators: { [suffix: string]: (fieldNode: QueryNode, valueNode: QueryNode) => QueryNode } = {
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

export class FilterTypeGenerator {
    @memorize()
    generate(type: ObjectType): FilterObjectType {
        return new FilterObjectType(`${type.name}Filter`,
            () => flatMap(type.fields, (field: Field) => this.generateFilterFields(field)));
    }

    private generateFilterFields(field: Field): FilterField[] {
        if (field.isList || !field.type.isScalarType) {
            return [];
        }
        const inputType = field.type.graphQLScalarType;

        if (field.type.graphQLScalarType == GraphQLString) {
            return [
                INPUT_FIELD_EQUAL,
                INPUT_FIELD_NOT
            ].map(generateScalarFilterField);
        }

        function generateScalarFilterField(name: string) {
            return new ScalarOrEnumFilterField(field, filterOperators[name], name === INPUT_FIELD_EQUAL ? undefined : name, inputType);
        }

        return [];
    }
}

function not(value: QueryNode): QueryNode {
    return new UnaryOperationQueryNode(value, UnaryOperator.NOT);
}

const and = binaryOp(BinaryOperator.AND);

function binaryOp(op: BinaryOperator) {
    return (lhs: QueryNode, rhs: QueryNode) => new BinaryOperationQueryNode(lhs, op, rhs);
}

function binaryNotOp(op: BinaryOperator) {
    return (lhs: QueryNode, rhs: QueryNode) => not(new BinaryOperationQueryNode(lhs, op, rhs));
}
