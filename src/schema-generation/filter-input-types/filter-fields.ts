import { getNamedType, GraphQLInputType, GraphQLList, GraphQLNonNull } from 'graphql';
import { ZonedDateTime } from '@js-joda/core';
import { EnumType, Field, ScalarType, Type, TypeKind } from '../../model';
import {
    BinaryOperationQueryNode,
    BinaryOperator,
    ConstBoolQueryNode,
    ListItemQueryNode,
    LiteralQueryNode,
    ObjectEntriesQueryNode,
    PropertyAccessQueryNode,
    QueryNode,
    VariableQueryNode,
} from '../../query-tree';
import { QuantifierFilterNode } from '../../query-tree/quantifiers';
import {
    AND_FILTER_FIELD,
    FILTER_FIELD_PREFIX_SEPARATOR,
    INPUT_FIELD_EQUAL,
    OR_FILTER_FIELD,
} from '../../schema/constants';
import { GraphQLOffsetDateTime, TIMESTAMP_PROPERTY } from '../../schema/scalars/offset-date-time';
import { AnyValue, decapitalize, PlainObject } from '../../utils/utils';
import { createFieldNode } from '../field-nodes';
import { TypedInputFieldBase } from '../typed-input-object-type';
import { FILTER_DESCRIPTIONS, OPERATORS_WITH_LIST_OPERAND, Quantifier } from './constants';
import { FilterObjectType } from './generator';

export interface FilterField extends TypedInputFieldBase<FilterField> {
    getFilterNode(sourceNode: QueryNode, filterValue: AnyValue): QueryNode;
}

function getDescription({
    operator,
    typeName,
    fieldName,
}: {
    operator: string | undefined;
    typeName: string;
    fieldName?: string;
}) {
    let descriptionTemplate = FILTER_DESCRIPTIONS[operator || INPUT_FIELD_EQUAL];
    if (typeof descriptionTemplate === 'object') {
        descriptionTemplate = descriptionTemplate[typeName] || descriptionTemplate[''];
    }
    return descriptionTemplate
        ? descriptionTemplate.replace(/\$field/g, fieldName ? '`' + fieldName + '`' : 'the value')
        : undefined;
}

export function getScalarFilterValueNode(fieldNode: QueryNode, type: Type): QueryNode {
    if (type.isScalarType && type.graphQLScalarType === GraphQLOffsetDateTime) {
        return new PropertyAccessQueryNode(fieldNode, TIMESTAMP_PROPERTY);
    }
    return fieldNode;
}

function getScalarFilterLiteralValue(value: unknown, type: Type): unknown {
    if (
        type.isScalarType &&
        type.graphQLScalarType === GraphQLOffsetDateTime &&
        value instanceof ZonedDateTime
    ) {
        return value.toInstant().toString();
    }
    return value;
}

export class ScalarOrEnumFieldFilterField implements FilterField {
    public readonly inputType: GraphQLInputType;
    public readonly description: string | undefined;

    constructor(
        public readonly field: Field,
        public readonly resolveOperator: (fieldNode: QueryNode, valueNode: QueryNode) => QueryNode,
        public readonly operatorPrefix: string | undefined,
        baseInputType: GraphQLInputType,
    ) {
        this.inputType = OPERATORS_WITH_LIST_OPERAND.includes(operatorPrefix || '')
            ? new GraphQLList(baseInputType)
            : baseInputType;
        this.description = getDescription({
            operator: operatorPrefix,
            fieldName: field.name,
            typeName: field.type.name,
        });
        if (this.field.description) {
            this.description =
                (this.description ? this.description + '\n\n' : '') + this.field.description;
        }
    }

    get name() {
        if (this.operatorPrefix == undefined) {
            return this.field.name;
        }
        return this.field.name + FILTER_FIELD_PREFIX_SEPARATOR + this.operatorPrefix;
    }

    getFilterNode(sourceNode: QueryNode, filterValue: AnyValue): QueryNode {
        if (
            this.operatorPrefix &&
            OPERATORS_WITH_LIST_OPERAND.includes(this.operatorPrefix) &&
            filterValue == null
        ) {
            return new ConstBoolQueryNode(true);
        }
        const valueNode = getScalarFilterValueNode(
            createFieldNode(this.field, sourceNode),
            this.field.type,
        );
        const literalNode = new LiteralQueryNode(
            getScalarFilterLiteralValue(filterValue, this.field.type),
        );
        return this.resolveOperator(valueNode, literalNode);
    }
}

export class StringMapEntryFilterField implements FilterField {
    public readonly inputType: GraphQLInputType;
    public readonly description: string | undefined;

    constructor(
        public readonly kind: 'key' | 'value',
        public readonly fieldName: string,
        public readonly resolveOperator: (fieldNode: QueryNode, valueNode: QueryNode) => QueryNode,
        public readonly operatorPrefix: string | undefined,
        baseInputType: GraphQLInputType,
    ) {
        this.inputType = OPERATORS_WITH_LIST_OPERAND.includes(operatorPrefix || '')
            ? new GraphQLList(baseInputType)
            : baseInputType;
        this.description = getDescription({
            operator: operatorPrefix,
            fieldName: fieldName,
            typeName: 'String',
        });
    }

    get name() {
        if (this.operatorPrefix == undefined) {
            return this.fieldName;
        }
        return this.fieldName + FILTER_FIELD_PREFIX_SEPARATOR + this.operatorPrefix;
    }

    getFilterNode(sourceNode: QueryNode, filterValue: AnyValue): QueryNode {
        if (
            this.operatorPrefix &&
            OPERATORS_WITH_LIST_OPERAND.includes(this.operatorPrefix) &&
            filterValue == null
        ) {
            return new ConstBoolQueryNode(true);
        }
        const valueNode = new ListItemQueryNode(sourceNode, this.kind === 'key' ? 0 : 1);
        const literalNode = new LiteralQueryNode(filterValue);
        return this.resolveOperator(valueNode, literalNode);
    }
}

export class ScalarOrEnumFilterField implements FilterField {
    public readonly inputType: GraphQLInputType;
    public readonly description: string | undefined;

    constructor(
        public readonly resolveOperator: (fieldNode: QueryNode, valueNode: QueryNode) => QueryNode,
        public readonly operatorName: string,
        private readonly baseType: ScalarType | EnumType,
        baseInputType: GraphQLInputType,
    ) {
        this.inputType = OPERATORS_WITH_LIST_OPERAND.includes(operatorName)
            ? new GraphQLList(baseInputType)
            : baseInputType;
        this.description = getDescription({
            operator: operatorName,
            typeName: getNamedType(baseInputType).name,
        });
    }

    get name() {
        return this.operatorName;
    }

    getFilterNode(sourceNode: QueryNode, filterValue: AnyValue): QueryNode {
        const literalNode = new LiteralQueryNode(
            getScalarFilterLiteralValue(filterValue, this.baseType),
        );
        return this.resolveOperator(
            getScalarFilterValueNode(sourceNode, this.baseType),
            literalNode,
        );
    }
}

export class QuantifierFilterField implements FilterField {
    readonly name: string;

    constructor(
        public readonly field: Field,
        public readonly quantifierName: Quantifier,
        public readonly inputType: FilterObjectType,
    ) {
        this.name = `${this.field.name}_${this.quantifierName}`;
    }

    get description(): string | undefined {
        switch (this.quantifierName) {
            case 'every':
                return `Makes sure all items in \`${this.field.name}\` match a certain filter.`;
            case 'none':
                return (
                    `Makes sure none of the items in \`${this.field.name}\` match a certain filter.\n\n` +
                    `Note that you can specify the empty object for this filter to make sure \`${this.field.name}\` has no items.`
                );
            case 'some':
                return (
                    `Makes sure at least one of the items in "${this.field.name}" matches a certain filter.\n\n` +
                    `Note that you can specify the empty object for this filter to make sure \`${this.field.name}\` has at least one item.`
                );
        }
        return undefined;
    }

    getFilterNode(sourceNode: QueryNode, filterValue: AnyValue): QueryNode {
        const listNode = createFieldNode(this.field, sourceNode);
        const itemVariable = new VariableQueryNode(decapitalize(this.field.name));
        const filterNode = this.inputType.getFilterNode(itemVariable, filterValue);

        return new QuantifierFilterNode({
            listNode,
            itemVariable,
            quantifier: this.quantifierName,
            conditionNode: filterNode,
        });
    }
}

export class NestedObjectFilterField implements FilterField {
    readonly name: string;
    readonly description: string;

    constructor(public readonly field: Field, public readonly inputType: FilterObjectType) {
        this.name = this.field.name;
        this.description = `Checks if \`${this.field.name}\` is not null, and allows to filter based on its fields.`;
        if (
            this.field.isReference &&
            this.field.type.kind == TypeKind.ROOT_ENTITY &&
            this.field.type.keyField
        ) {
            this.description =
                `Filters the through \`${this.field.type.keyField.name}\` referenced ${this.field.type.pluralName} that fulfills the given requirements.\n\n ` +
                this.description;
        }
    }

    getFilterNode(sourceNode: QueryNode, filterValue: AnyValue): QueryNode {
        return this.inputType.getFilterNode(createFieldNode(this.field, sourceNode), filterValue);
    }
}

export class EntityExtensionFilterField implements FilterField {
    readonly name: string;
    readonly description: string;

    constructor(public readonly field: Field, public readonly inputType: FilterObjectType) {
        this.name = this.field.name;
        this.description = `Allows to filter on the fields of \`${this.field.name}\`.\n\nNote that \`${this.field.name}\` is an entity extension and thus can never be \`null\`, so specifying \`null\` to this filter field has no effect.`;
    }

    getFilterNode(sourceNode: QueryNode, filterValue: AnyValue): QueryNode {
        if (filterValue == undefined) {
            // entity extensions can't ever be null, and null is always coerced to {}, so this filter just shouldn't have any effect
            return ConstBoolQueryNode.TRUE;
        }
        return this.inputType.getFilterNode(createFieldNode(this.field, sourceNode), filterValue);
    }
}

export interface ListFilterField extends FilterField {
    readonly inputType: FilterObjectType;
    readonly field: Field;
}

export class AndFilterField implements FilterField {
    readonly name: string;
    readonly description: string;
    readonly inputType: GraphQLInputType;

    constructor(public readonly filterType: FilterObjectType) {
        this.name = AND_FILTER_FIELD;
        this.description = `A field that checks if all filters in the list apply\n\nIf the list is empty, this filter applies to all objects.`;
        this.inputType = new GraphQLList(new GraphQLNonNull(filterType.getInputType()));
    }

    getFilterNode(sourceNode: QueryNode, filterValue: AnyValue): QueryNode {
        if (!Array.isArray(filterValue) || !filterValue.length) {
            return new ConstBoolQueryNode(true);
        }
        const values = (filterValue || []) as ReadonlyArray<PlainObject>;
        const nodes = values.map((value) => this.filterType.getFilterNode(sourceNode, value));
        return nodes.reduce(
            (prev, node) => new BinaryOperationQueryNode(prev, BinaryOperator.AND, node),
        );
    }
}

export class OrFilterField implements FilterField {
    public readonly name: string;
    public readonly description?: string;
    public readonly inputType: GraphQLInputType;

    constructor(public readonly filterType: FilterObjectType) {
        this.name = OR_FILTER_FIELD;
        this.description = `A field that checks if any of the filters in the list apply.\n\nIf the list is empty, this filter applies to no objects.\n\nNote that only the items in the list *or*-combined; this complete \`OR\` field is *and*-combined with outer fields in the parent filter type.`;
        this.inputType = new GraphQLList(new GraphQLNonNull(filterType.getInputType()));
    }

    getFilterNode(sourceNode: QueryNode, filterValue: AnyValue): QueryNode {
        if (!Array.isArray(filterValue)) {
            return new ConstBoolQueryNode(true); // regard as omitted
        }
        const values = filterValue as ReadonlyArray<PlainObject>;
        if (!values.length) {
            return ConstBoolQueryNode.FALSE; // neutral element of OR
        }
        const nodes = values.map((value) => this.filterType.getFilterNode(sourceNode, value));
        return nodes.reduce(
            (prev, node) => new BinaryOperationQueryNode(prev, BinaryOperator.OR, node),
        );
    }
}

export class StringMapSomeValueFilterField implements FilterField {
    readonly name: string;

    constructor(public readonly field: Field, public readonly inputType: FilterObjectType) {
        this.name = `${this.field.name}_some`;
    }

    get description(): string | undefined {
        return (
            `Makes sure at least one of the entries in "${this.field.name}" has a value that matches a certain filter.\n\n` +
            `Note that you can specify the empty object for this filter to make sure \`${this.field.name}\` has at least one item.`
        );
    }

    getFilterNode(sourceNode: QueryNode, filterValue: AnyValue): QueryNode {
        const objectNode = createFieldNode(this.field, sourceNode);
        const itemVariable = new VariableQueryNode(decapitalize(this.field.name));
        const filterNode = this.inputType.getFilterNode(itemVariable, filterValue);

        return new QuantifierFilterNode({
            listNode: new ObjectEntriesQueryNode(objectNode),
            itemVariable,
            conditionNode: filterNode,
            quantifier: 'some',
        });
    }
}
