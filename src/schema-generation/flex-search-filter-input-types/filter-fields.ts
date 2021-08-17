import { getNamedType, GraphQLInputType, GraphQLList, GraphQLNonNull } from 'graphql';
import { Field, FlexSearchLanguage, TypeKind } from '../../model';
import {
    BinaryOperationQueryNode,
    BinaryOperator,
    ConstBoolQueryNode,
    FieldPathQueryNode,
    LiteralQueryNode,
    NullQueryNode,
    QueryNode,
    RootEntityIDQueryNode,
    RuntimeErrorQueryNode
} from '../../query-tree';
import { FlexSearchFieldExistsQueryNode } from '../../query-tree/flex-search';
import {
    AND_FILTER_FIELD,
    FILTER_FIELD_PREFIX_SEPARATOR,
    ID_FIELD,
    INPUT_FIELD_EQUAL,
    INPUT_FIELD_GT,
    INPUT_FIELD_GTE,
    INPUT_FIELD_IN,
    INPUT_FIELD_LT,
    INPUT_FIELD_LTE,
    INPUT_FIELD_NOT,
    INPUT_FIELD_NOT_IN,
    INPUT_FIELD_NOT_STARTS_WITH,
    INPUT_FIELD_STARTS_WITH,
    OR_FILTER_FIELD
} from '../../schema/constants';
import { AnyValue, PlainObject } from '../../utils/utils';
import { QueryNodeResolveInfo } from '../query-node-object-type';
import { TypedInputFieldBase } from '../typed-input-object-type';
import { not } from '../utils/input-types';
import {
    FLEX_SEARCH_FILTER_DESCRIPTIONS,
    FLEX_SEARCH_OPERATORS_WITH_LIST_OPERAND,
    STRING_TEXT_ANALYZER_FILTER_FIELDS
} from './constants';
import { FlexSearchFilterObjectType } from './generator';

const NESTED_FIELD_SUFFIX = 'Aggregation';

export interface FlexSearchFilterField extends TypedInputFieldBase<FlexSearchFilterField> {
    getFilterNode(
        sourceNode: QueryNode,
        filterValue: AnyValue,
        path: ReadonlyArray<Field>,
        info: QueryNodeResolveInfo
    ): QueryNode;
}

function getDescription({
    operator,
    typeName,
    fieldName
}: {
    operator: string | undefined;
    typeName: string;
    fieldName?: string;
    isAggregation?: boolean;
}) {
    let descriptionTemplate = FLEX_SEARCH_FILTER_DESCRIPTIONS[operator || INPUT_FIELD_EQUAL];
    if (typeof descriptionTemplate === 'object') {
        descriptionTemplate = descriptionTemplate[typeName] || descriptionTemplate[''];
    }
    return descriptionTemplate
        ? descriptionTemplate.replace(/\$field/g, fieldName ? '`' + fieldName + '`' : 'the value')
        : undefined;
}

export class FlexSearchScalarOrEnumFieldFilterField implements FlexSearchFilterField {
    public readonly inputType: GraphQLInputType;
    public readonly description: string | undefined;

    constructor(
        public readonly field: Field,
        public readonly resolveOperator: (
            fieldNode: QueryNode,
            valueNode: QueryNode,
            flexSearchLanguage?: FlexSearchLanguage,
            analyzer?: string
        ) => QueryNode,
        public readonly operatorPrefix: string | undefined,
        baseInputType: GraphQLInputType,
        public readonly flexSearchLanguage?: FlexSearchLanguage,
        public readonly analyzer?: string
    ) {
        this.inputType = FLEX_SEARCH_OPERATORS_WITH_LIST_OPERAND.includes(operatorPrefix || '')
            ? new GraphQLList(baseInputType)
            : baseInputType;
        this.description = getDescription({
            operator: operatorPrefix,
            fieldName: field.name,
            typeName: field.type.name,
            isAggregation: this.operatorPrefix != undefined
        });

        if (this.field.description) {
            this.description = (this.description ? this.description + '\n\n' : '') + this.field.description;
        }
    }

    get name() {
        if (this.operatorPrefix == undefined) {
            return this.field.name;
        }
        return this.field.name + FILTER_FIELD_PREFIX_SEPARATOR + this.operatorPrefix;
    }

    getFilterNode(
        sourceNode: QueryNode,
        filterValue: AnyValue,
        path: ReadonlyArray<Field>,
        info: QueryNodeResolveInfo
    ): QueryNode {
        if (
            this.operatorPrefix &&
            FLEX_SEARCH_OPERATORS_WITH_LIST_OPERAND.includes(this.operatorPrefix) &&
            filterValue == null
        ) {
            return new ConstBoolQueryNode(true);
        }

        let valueNode;
        if (this.field.declaringType.isRootEntityType && this.field.isSystemField && this.field.name === ID_FIELD) {
            if (path.length) {
                throw new Error(`Tried to create cross-root-entity flexSearch filter`);
            }
            valueNode = new RootEntityIDQueryNode(sourceNode);
        } else {
            valueNode = new FieldPathQueryNode(sourceNode, path.concat(this.field));
        }
        const literalNode = new LiteralQueryNode(filterValue);
        if (
            (this.operatorPrefix == undefined ||
                this.operatorPrefix === '' ||
                this.operatorPrefix === INPUT_FIELD_LTE) &&
            filterValue == null
        ) {
            return new BinaryOperationQueryNode(
                new BinaryOperationQueryNode(valueNode, BinaryOperator.EQUAL, NullQueryNode.NULL),
                BinaryOperator.OR,
                not(new FlexSearchFieldExistsQueryNode(valueNode, this.flexSearchLanguage))
            );
        }
        if (this.operatorPrefix == INPUT_FIELD_IN && Array.isArray(filterValue) && filterValue.includes(null)) {
            return new BinaryOperationQueryNode(
                this.resolveOperator(valueNode, literalNode, this.flexSearchLanguage, this.analyzer),
                BinaryOperator.OR,
                not(new FlexSearchFieldExistsQueryNode(valueNode, this.flexSearchLanguage))
            );
        }
        if ((this.operatorPrefix == INPUT_FIELD_NOT || this.operatorPrefix === INPUT_FIELD_GT) && filterValue == null) {
            return new BinaryOperationQueryNode(
                new BinaryOperationQueryNode(valueNode, BinaryOperator.UNEQUAL, NullQueryNode.NULL),
                BinaryOperator.AND,
                new FlexSearchFieldExistsQueryNode(valueNode, this.flexSearchLanguage)
            );
        }
        if (this.operatorPrefix == INPUT_FIELD_NOT_IN && Array.isArray(filterValue) && filterValue.includes(null)) {
            return new BinaryOperationQueryNode(
                this.resolveOperator(valueNode, literalNode, this.flexSearchLanguage, this.analyzer),
                BinaryOperator.AND,
                new FlexSearchFieldExistsQueryNode(valueNode, this.flexSearchLanguage)
            );
        }

        if (this.operatorPrefix === INPUT_FIELD_LT && filterValue === null) {
            return ConstBoolQueryNode.FALSE;
        }

        if (this.operatorPrefix === INPUT_FIELD_GTE && filterValue === null) {
            return ConstBoolQueryNode.TRUE;
        }

        if (this.operatorPrefix == INPUT_FIELD_NOT_STARTS_WITH && filterValue === '') {
            return new ConstBoolQueryNode(false);
        }
        if (
            (this.operatorPrefix == INPUT_FIELD_STARTS_WITH ||
                this.operatorPrefix == INPUT_FIELD_NOT_STARTS_WITH ||
                STRING_TEXT_ANALYZER_FILTER_FIELDS.some(value => this.operatorPrefix === value)) &&
            (filterValue == null || filterValue === '')
        ) {
            return new ConstBoolQueryNode(true);
        }

        return this.resolveOperator(valueNode, literalNode, this.flexSearchLanguage, this.analyzer);
    }
}

export class FlexSearchScalarOrEnumFilterField implements FlexSearchFilterField {
    public readonly inputType: GraphQLInputType;
    public readonly description: string | undefined;

    constructor(
        public readonly field: Field,
        public readonly resolveOperator: (
            fieldNode: QueryNode,
            valueNode: QueryNode,
            flexSearchLanguage?: FlexSearchLanguage,
            analyzer?: string
        ) => QueryNode,
        public readonly operatorName: string,
        baseInputType: GraphQLInputType,
        public readonly flexSearchLanguage?: FlexSearchLanguage,
        public readonly analyzer?: string
    ) {
        this.inputType = FLEX_SEARCH_OPERATORS_WITH_LIST_OPERAND.includes(operatorName)
            ? new GraphQLList(baseInputType)
            : baseInputType;
        this.description = getDescription({ operator: operatorName, typeName: getNamedType(baseInputType).name });
    }

    get name() {
        if (this.operatorName == undefined) {
            return this.field.name;
        }
        return (
            this.field.name +
            FILTER_FIELD_PREFIX_SEPARATOR +
            NESTED_FIELD_SUFFIX.toLowerCase() +
            FILTER_FIELD_PREFIX_SEPARATOR +
            this.operatorName
        );
    }

    getFilterNode(
        sourceNode: QueryNode,
        filterValue: AnyValue,
        path: ReadonlyArray<Field>,
        info: QueryNodeResolveInfo
    ): QueryNode {
        const valueNode = new FieldPathQueryNode(sourceNode, path.concat(this.field));
        const literalNode = new LiteralQueryNode(filterValue);
        return this.resolveOperator(valueNode, literalNode, this.flexSearchLanguage, this.analyzer);
    }
}

export class FlexSearchNestedObjectFilterField implements FlexSearchFilterField {
    readonly name: string;
    readonly description: string;

    constructor(public readonly field: Field, public readonly inputType: FlexSearchFilterObjectType) {
        this.name = this.field.isList ? this.field.name + NESTED_FIELD_SUFFIX : this.field.name;
        this.description = `Checks if \`${this.field.name}\` is not null, and allows to filter based on its fields.`;
        if (this.field.isReference && this.field.type.kind == TypeKind.ROOT_ENTITY && this.field.type.keyField) {
            this.description =
                `Filters the through \`${this.field.type.keyField.name}\` referenced ${this.field.type.pluralName} that fulfills the given requirements.\n\n ` +
                this.description;
        }
    }

    getFilterNode(
        sourceNode: QueryNode,
        filterValue: AnyValue,
        path: ReadonlyArray<Field>,
        info: QueryNodeResolveInfo
    ): QueryNode {
        // if path contains any Field twice
        const recursionDepth = info.flexSearchRecursionDepth ? info.flexSearchRecursionDepth : 1;
        if (
            path.some(
                value =>
                    path.filter(value1 => value.type.isObjectType && value.type == value1.type).length > recursionDepth
            )
        ) {
            return new RuntimeErrorQueryNode(
                `Recursive filters can only be defined for ${recursionDepth} level of recursion.`
            );
        }
        if (filterValue == null) {
            const valueNode = new FieldPathQueryNode(sourceNode, path.concat(this.field));
            const literalNode = new NullQueryNode();
            const node = new BinaryOperationQueryNode(
                new BinaryOperationQueryNode(valueNode, BinaryOperator.EQUAL, literalNode),
                BinaryOperator.OR,
                not(new FlexSearchFieldExistsQueryNode(valueNode))
            );
            if (path.length > 0) {
                return new BinaryOperationQueryNode(
                    node,
                    BinaryOperator.AND,
                    new FlexSearchFieldExistsQueryNode(new FieldPathQueryNode(sourceNode, path))
                );
            } else {
                return node;
            }
        } else {
            return this.inputType.getFilterNode(sourceNode, filterValue, path.concat(this.field), info);
        }
    }
}

export class FlexSearchEntityExtensionFilterField implements FlexSearchFilterField {
    readonly name: string;
    readonly description: string;

    constructor(public readonly field: Field, public readonly inputType: FlexSearchFilterObjectType) {
        this.name = this.field.isList ? this.field.name + NESTED_FIELD_SUFFIX : this.field.name;
        this.description = `Allows to filter on the fields of \`${this.field.name}\`.\n\nNote that \`${this.field.name}\` is an entity extension and thus can never be \`null\`, so specifying \`null\` to this filter field has no effect.`;
    }

    getFilterNode(
        sourceNode: QueryNode,
        filterValue: AnyValue,
        path: ReadonlyArray<Field>,
        info: QueryNodeResolveInfo
    ): QueryNode {
        if (filterValue == undefined) {
            // entity extensions can't ever be null, and null is always coerced to {}, so this filter just shouldn't have any effect
            return ConstBoolQueryNode.TRUE;
        }
        return this.inputType.getFilterNode(sourceNode, filterValue, path.concat(this.field), info);
    }
}

export class FlexSearchAndFilterField implements FlexSearchFilterField {
    readonly name: string;
    readonly description: string;
    readonly inputType: GraphQLInputType;

    constructor(public readonly filterType: FlexSearchFilterObjectType) {
        this.name = AND_FILTER_FIELD;
        this.description = `A field that checks if all filters in the list apply\n\nIf the list is empty, this filter applies to all objects.`;
        this.inputType = new GraphQLList(new GraphQLNonNull(filterType.getInputType()));
    }

    getFilterNode(
        sourceNode: QueryNode,
        filterValue: AnyValue,
        path: ReadonlyArray<Field>,
        info: QueryNodeResolveInfo
    ): QueryNode {
        if (!Array.isArray(filterValue) || !filterValue.length) {
            return new ConstBoolQueryNode(true);
        }
        const values = (filterValue || []) as ReadonlyArray<PlainObject>;
        const nodes = values.map(value => this.filterType.getFilterNode(sourceNode, value, path, info));
        return nodes.reduce((prev, node) => new BinaryOperationQueryNode(prev, BinaryOperator.AND, node));
    }
}

export class FlexSearchOrFilterField implements FlexSearchFilterField {
    public readonly name: string;
    public readonly description?: string;
    public readonly inputType: GraphQLInputType;

    constructor(public readonly filterType: FlexSearchFilterObjectType) {
        this.name = OR_FILTER_FIELD;
        this.description = `A field that checks if any of the filters in the list apply.\n\nIf the list is empty, this filter applies to no objects.\n\nNote that only the items in the list *or*-combined; this complete \`OR\` field is *and*-combined with outer fields in the parent filter type.`;
        this.inputType = new GraphQLList(new GraphQLNonNull(filterType.getInputType()));
    }

    getFilterNode(
        sourceNode: QueryNode,
        filterValue: AnyValue,
        path: ReadonlyArray<Field>,
        info: QueryNodeResolveInfo
    ): QueryNode {
        if (!Array.isArray(filterValue)) {
            return new ConstBoolQueryNode(true); // regard as omitted
        }
        const values = filterValue as ReadonlyArray<PlainObject>;
        if (!values.length) {
            return ConstBoolQueryNode.FALSE; // neutral element of OR
        }
        const nodes = values.map(value => this.filterType.getFilterNode(sourceNode, value, path, info));
        return nodes.reduce((prev, node) => new BinaryOperationQueryNode(prev, BinaryOperator.OR, node));
    }
}
