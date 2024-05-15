import {
    getNamedType,
    GraphQLBoolean,
    GraphQLInputType,
    GraphQLList,
    GraphQLNonNull,
    GraphQLString,
} from 'graphql';
import { Field, TypeKind } from '../../model';
import {
    BinaryOperationQueryNode,
    BinaryOperator,
    ConstBoolQueryNode,
    FieldQueryNode,
    LiteralQueryNode,
    NullQueryNode,
    PropertyAccessQueryNode,
    QueryNode,
    RootEntityIDQueryNode,
    RuntimeErrorQueryNode,
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
    OR_FILTER_FIELD,
} from '../../schema/constants';
import { AnyValue, PlainObject } from '../../utils/utils';
import {
    FilterField,
    getScalarFilterLiteralValue,
    getScalarFilterValueNode,
} from '../filter-input-types/filter-fields';
import { QueryNodeResolveInfo } from '../query-node-object-type';
import { TypedInputFieldBase } from '../typed-input-object-type';
import { not } from '../utils/input-types';
import {
    FLEX_SEARCH_FILTER_DESCRIPTIONS,
    FLEX_SEARCH_OPERATORS_WITH_LIST_OPERAND,
    STRING_TEXT_ANALYZER_FILTER_FIELDS,
} from './constants';
import { FlexSearchFilterObjectType } from './filter-types';

const NESTED_FIELD_SUFFIX = 'Aggregation';

export interface FlexSearchFilterField extends TypedInputFieldBase<FlexSearchFilterField> {
    getFilterNode(
        sourceNode: QueryNode,
        filterValue: AnyValue,
        path: ReadonlyArray<Field>,
        info: QueryNodeResolveInfo,
    ): QueryNode;
}

function getDescription({
    operator,
    typeName,
    fieldName,
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
            analyzer?: string,
        ) => QueryNode,
        public readonly operatorSuffix: string | undefined,
        baseInputType: GraphQLInputType,
        public readonly analyzer?: string,
        readonly isAggregation: boolean = false,
    ) {
        if (!resolveOperator) {
            // this is looked up from string maps, so it might be undefined in case of a bug -> fail early
            throw new Error(
                `Filter field for ${field.name} with suffix ${operatorSuffix} is missing the resolve function`,
            );
        }
        this.inputType = FLEX_SEARCH_OPERATORS_WITH_LIST_OPERAND.includes(operatorSuffix || '')
            ? new GraphQLList(baseInputType)
            : baseInputType;
        this.description = getDescription({
            operator: operatorSuffix,
            fieldName: field.name,
            typeName: field.type.name,
            isAggregation: this.operatorSuffix != undefined,
        });

        if (this.field.description) {
            this.description =
                (this.description ? this.description + '\n\n' : '') + this.field.description;
        }
    }

    get operatorName() {
        return this.operatorSuffix ?? INPUT_FIELD_EQUAL;
    }

    get name() {
        return (
            this.field.name +
            (this.isAggregation
                ? FILTER_FIELD_PREFIX_SEPARATOR + NESTED_FIELD_SUFFIX.toLowerCase()
                : '') +
            (this.operatorSuffix ? FILTER_FIELD_PREFIX_SEPARATOR + this.operatorSuffix : '')
        );
    }

    getFilterNode(
        sourceNode: QueryNode,
        filterValue: AnyValue,
        path: ReadonlyArray<Field>,
        info: QueryNodeResolveInfo,
    ): QueryNode {
        let valueNode;
        if (
            this.field.declaringType.isRootEntityType &&
            this.field.isSystemField &&
            this.field.name === ID_FIELD
        ) {
            if (path.length) {
                throw new Error(`Tried to create cross-root-entity flexSearch filter`);
            }
            valueNode = new RootEntityIDQueryNode(sourceNode);
        } else {
            valueNode = new FieldQueryNode(sourceNode, this.field);
        }

        // handle special cases like .timestamp for OffsetDateTime
        valueNode = getScalarFilterValueNode(valueNode, this.field.type);
        filterValue = getScalarFilterLiteralValue(filterValue, this.field.type);

        return resolveFilterField(this, valueNode, filterValue, this.analyzer);
    }
}

export class FlexSearchScalarOrEnumFilterField implements FlexSearchFilterField {
    public readonly inputType: GraphQLInputType;
    public readonly description: string | undefined;

    constructor(
        public readonly resolveOperator: (
            fieldNode: QueryNode,
            valueNode: QueryNode,
            analyzer?: string,
        ) => QueryNode,
        public readonly operatorName: string,
        baseInputType: GraphQLInputType,
        readonly usesFullTextIndex: boolean,
    ) {
        this.inputType = FLEX_SEARCH_OPERATORS_WITH_LIST_OPERAND.includes(operatorName)
            ? new GraphQLList(baseInputType)
            : baseInputType;
        this.description = getDescription({
            operator: operatorName,
            typeName: getNamedType(baseInputType).name,
        });
        if (!resolveOperator) {
            // this is looked up from string maps, so it might be undefined in case of a bug -> fail early
            throw new Error(
                `Filter field for operator ${operatorName} is missing the resolve function`,
            );
        }
    }

    get name() {
        return this.operatorName;
    }

    getFilterNode(
        sourceNode: QueryNode,
        filterValue: AnyValue,
        path: ReadonlyArray<Field>,
        info: QueryNodeResolveInfo,
    ): QueryNode {
        const lastField = path[path.length - 1];
        if (!lastField) {
            throw new Error(`FlexSearchScalarOrEnumFilterField without surrounding filter field`);
        }
        return resolveFilterField(
            this,
            sourceNode,
            filterValue,
            this.usesFullTextIndex
                ? lastField.getFlexSearchFulltextAnalyzerOrThrow()
                : lastField.flexSearchAnalyzer,
        );
    }
}

export class FlexSearchNestedObjectFilterField implements FlexSearchFilterField {
    readonly name: string;
    readonly description: string;

    constructor(
        public readonly field: Field,
        public readonly inputType: FlexSearchFilterObjectType,
    ) {
        this.name = this.field.isList ? this.field.name + NESTED_FIELD_SUFFIX : this.field.name;
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

    getFilterNode(
        sourceNode: QueryNode,
        filterValue: AnyValue,
        path: ReadonlyArray<Field>,
        info: QueryNodeResolveInfo,
    ): QueryNode {
        // if path contains any Field twice
        const recursionDepth = info.flexSearchRecursionDepth ? info.flexSearchRecursionDepth : 1;
        if (
            path.some(
                (value) =>
                    path.filter((value1) => value.type.isObjectType && value.type == value1.type)
                        .length > recursionDepth,
            )
        ) {
            return new RuntimeErrorQueryNode(
                `Recursive filters can only be defined for ${recursionDepth} level of recursion.`,
            );
        }
        if (filterValue == null) {
            const valueNode = new FieldQueryNode(sourceNode, this.field);
            const literalNode = new NullQueryNode();
            const node = new BinaryOperationQueryNode(
                new BinaryOperationQueryNode(valueNode, BinaryOperator.EQUAL, literalNode),
                BinaryOperator.OR,
                not(new FlexSearchFieldExistsQueryNode(valueNode, this.field.flexSearchAnalyzer)),
            );
            if (path.length > 0) {
                return new BinaryOperationQueryNode(
                    node,
                    BinaryOperator.AND,
                    new FlexSearchFieldExistsQueryNode(valueNode, this.field.flexSearchAnalyzer),
                );
            } else {
                return node;
            }
        } else {
            return this.inputType.getFilterNode(
                new FieldQueryNode(sourceNode, this.field),
                filterValue,
                path.concat(this.field),
                info,
            );
        }
    }
}

export class FlexSearchEntityExtensionFilterField implements FlexSearchFilterField {
    readonly name: string;
    readonly description: string;

    constructor(
        public readonly field: Field,
        public readonly inputType: FlexSearchFilterObjectType,
    ) {
        this.name = this.field.isList ? this.field.name + NESTED_FIELD_SUFFIX : this.field.name;
        this.description = `Allows to filter on the fields of \`${this.field.name}\`.\n\nNote that \`${this.field.name}\` is an entity extension and thus can never be \`null\`, so specifying \`null\` to this filter field has no effect.`;
    }

    getFilterNode(
        sourceNode: QueryNode,
        filterValue: AnyValue,
        path: ReadonlyArray<Field>,
        info: QueryNodeResolveInfo,
    ): QueryNode {
        if (filterValue == undefined) {
            // entity extensions can't ever be null, and null is always coerced to {}, so this filter just shouldn't have any effect
            return ConstBoolQueryNode.TRUE;
        }
        const valueNode = new FieldQueryNode(sourceNode, this.field);
        return this.inputType.getFilterNode(valueNode, filterValue, path.concat(this.field), info);
    }
}

export class FlexSearchEmptyListFilterField implements FlexSearchFilterField {
    readonly name: string;
    readonly description: string;

    readonly inputType = GraphQLBoolean;

    constructor(public readonly field: Field) {
        this.name = this.field.name + '_empty';
        this.description = `Checks if \`${this.field.name}\` is an empty list (true) or a non-empty list or null (false).`;
    }

    getFilterNode(
        sourceNode: QueryNode,
        filterValue: AnyValue,
        path: ReadonlyArray<Field>,
        info: QueryNodeResolveInfo,
    ): QueryNode {
        if (filterValue == undefined) {
            // null means do not filter
            return ConstBoolQueryNode.TRUE;
        }
        const valueNode = new FieldQueryNode(sourceNode, this.field);
        if (typeof filterValue !== 'boolean') {
            throw new Error(
                `Expected value for FlexSearchEmptyListFilterField to be null, false or true, but is ${String(
                    filterValue,
                )}`,
            );
        }
        const existsNode = new FlexSearchFieldExistsQueryNode(valueNode);
        if (filterValue) {
            // _empty: true means NOT EXISTS() because EXISTS() is false for empty arrays
            return not(existsNode);
        } else {
            return existsNode;
        }
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
        info: QueryNodeResolveInfo,
    ): QueryNode {
        if (!Array.isArray(filterValue) || !filterValue.length) {
            return new ConstBoolQueryNode(true);
        }
        const values = (filterValue || []) as ReadonlyArray<PlainObject>;
        const nodes = values.map((value) =>
            this.filterType.getFilterNode(sourceNode, value, path, info),
        );
        return nodes.reduce(
            (prev, node) => new BinaryOperationQueryNode(prev, BinaryOperator.AND, node),
        );
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
        info: QueryNodeResolveInfo,
    ): QueryNode {
        if (!Array.isArray(filterValue)) {
            return new ConstBoolQueryNode(true); // regard as omitted
        }
        const values = filterValue as ReadonlyArray<PlainObject>;
        if (!values.length) {
            return ConstBoolQueryNode.FALSE; // neutral element of OR
        }
        const nodes = values.map((value) =>
            this.filterType.getFilterNode(sourceNode, value, path, info),
        );
        return nodes.reduce(
            (prev, node) => new BinaryOperationQueryNode(prev, BinaryOperator.OR, node),
        );
    }
}

export class FlexSearchI18nStringLocalizedFilterField implements FlexSearchFilterField {
    readonly name: string;

    constructor(
        public readonly field: Field,
        public readonly inputType: FlexSearchFilterObjectType,
    ) {
        this.name = `${this.field.name}_localized`;
    }

    get description(): string | undefined {
        return (
            `Makes sure at least one of the entries in "${this.field.name}" has a value that matches a certain filter.\n\n` +
            `Note that you can specify the empty object for this filter to make sure \`${this.field.name}\` has at least one item.`
        );
    }

    getFilterNode(
        sourceNode: QueryNode,
        filterValue: AnyValue,
        path: ReadonlyArray<Field>,
        info: QueryNodeResolveInfo,
    ): QueryNode {
        if (filterValue == undefined) {
            // does not really make sense because language is required
            return ConstBoolQueryNode.TRUE;
        }

        const language = (filterValue as any)?.[I18nStringLocalizedFilterLanguageField.fieldName];
        if (typeof language !== 'string') {
            throw new Error(`Missing language for flexSearch _localized filter`);
        }

        const fieldValueNode = new FieldQueryNode(sourceNode, this.field);
        const localizedValueNode = new PropertyAccessQueryNode(fieldValueNode, language);

        return this.inputType.getFilterNode(
            localizedValueNode,
            filterValue,
            path.concat(this.field),
            info,
        );
    }
}

export class I18nStringLocalizedFilterLanguageField implements FilterField {
    static readonly fieldName = 'language';

    readonly name = I18nStringLocalizedFilterLanguageField.fieldName;

    readonly inputType = new GraphQLNonNull(GraphQLString);

    readonly description = `Sets the language to be used for the filters in this object`;

    getFilterNode(sourceNode: QueryNode, filterValue: AnyValue): QueryNode {
        // no filtering done here
        return ConstBoolQueryNode.TRUE;
    }
}

export function resolveFilterField(
    filterField: FlexSearchScalarOrEnumFieldFilterField | FlexSearchScalarOrEnumFilterField,
    valueNode: QueryNode,
    filterValue: AnyValue,
    analyzer: string | undefined,
): QueryNode {
    if (
        FLEX_SEARCH_OPERATORS_WITH_LIST_OPERAND.includes(filterField.operatorName) &&
        filterValue == null
    ) {
        return new ConstBoolQueryNode(true);
    }

    const literalNode = new LiteralQueryNode(filterValue);
    if (
        (filterField.operatorName === INPUT_FIELD_EQUAL ||
            filterField.operatorName === INPUT_FIELD_LTE) &&
        filterValue == null
    ) {
        return new BinaryOperationQueryNode(
            new BinaryOperationQueryNode(valueNode, BinaryOperator.EQUAL, NullQueryNode.NULL),
            BinaryOperator.OR,
            not(new FlexSearchFieldExistsQueryNode(valueNode, analyzer)),
        );
    }
    // field < x and field <= x should also find NULL values, because that's how it behaves in non-flexsearch case
    if (
        (filterField.operatorName === INPUT_FIELD_LT ||
            filterField.operatorName === INPUT_FIELD_LTE) &&
        filterValue != null
    ) {
        const isNull = new BinaryOperationQueryNode(
            new BinaryOperationQueryNode(valueNode, BinaryOperator.EQUAL, NullQueryNode.NULL),
            BinaryOperator.OR,
            not(new FlexSearchFieldExistsQueryNode(valueNode, analyzer)),
        );
        return new BinaryOperationQueryNode(
            isNull,
            BinaryOperator.OR,
            filterField.resolveOperator(valueNode, literalNode, analyzer),
        );
    }
    if (
        filterField.operatorName == INPUT_FIELD_IN &&
        Array.isArray(filterValue) &&
        filterValue.includes(null)
    ) {
        return new BinaryOperationQueryNode(
            filterField.resolveOperator(valueNode, literalNode, analyzer),
            BinaryOperator.OR,
            not(new FlexSearchFieldExistsQueryNode(valueNode, analyzer)),
        );
    }
    if (
        (filterField.operatorName == INPUT_FIELD_NOT ||
            filterField.operatorName === INPUT_FIELD_GT) &&
        filterValue == null
    ) {
        return new BinaryOperationQueryNode(
            new BinaryOperationQueryNode(valueNode, BinaryOperator.UNEQUAL, NullQueryNode.NULL),
            BinaryOperator.AND,
            new FlexSearchFieldExistsQueryNode(valueNode, analyzer),
        );
    }
    if (
        filterField.operatorName == INPUT_FIELD_NOT_IN &&
        Array.isArray(filterValue) &&
        filterValue.includes(null)
    ) {
        return new BinaryOperationQueryNode(
            filterField.resolveOperator(valueNode, literalNode, analyzer),
            BinaryOperator.AND,
            new FlexSearchFieldExistsQueryNode(valueNode, analyzer),
        );
    }

    if (filterField.operatorName === INPUT_FIELD_LT && filterValue === null) {
        return ConstBoolQueryNode.FALSE;
    }

    if (filterField.operatorName === INPUT_FIELD_GTE && filterValue === null) {
        return ConstBoolQueryNode.TRUE;
    }

    if (filterField.operatorName == INPUT_FIELD_NOT_STARTS_WITH && filterValue === '') {
        return new ConstBoolQueryNode(false);
    }
    if (
        (filterField.operatorName == INPUT_FIELD_STARTS_WITH ||
            filterField.operatorName == INPUT_FIELD_NOT_STARTS_WITH ||
            STRING_TEXT_ANALYZER_FILTER_FIELDS.some(
                (value) => filterField.operatorName === value,
            )) &&
        (filterValue == null || filterValue === '')
    ) {
        return new ConstBoolQueryNode(true);
    }

    return filterField.resolveOperator(valueNode, literalNode, analyzer);
}
