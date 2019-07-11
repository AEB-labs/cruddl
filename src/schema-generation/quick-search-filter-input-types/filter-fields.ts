import { getNamedType, GraphQLInputType, GraphQLList, GraphQLNonNull } from 'graphql';
import * as pluralize from 'pluralize';
import { isArray } from 'util';
import { Field, QuickSearchLanguage, TypeKind } from '../../model';
import { BinaryOperationQueryNode, BinaryOperator, ConstBoolQueryNode, FieldPathQueryNode, LiteralQueryNode, QueryNode, RuntimeErrorQueryNode } from '../../query-tree';
import { QuickSearchFieldExistsQueryNode } from '../../query-tree/quick-search';
import { AND_FILTER_FIELD, FILTER_FIELD_PREFIX_SEPARATOR, INPUT_FIELD_EQUAL, INPUT_FIELD_NOT, INPUT_FIELD_NOT_STARTS_WITH, INPUT_FIELD_STARTS_WITH, OR_FILTER_FIELD } from '../../schema/constants';
import { AnyValue, PlainObject } from '../../utils/utils';
import { not } from '../utils/input-types';
import { QuickSearchFilterObjectType } from '../quick-search-filter-input-types/generator';
import { TypedInputFieldBase } from '../typed-input-object-type';
import { QUICK_SEARCH_FILTER_DESCRIPTIONS, QUICK_SEARCH_OPERATORS_WITH_LIST_OPERAND, STRING_TEXT_ANALYZER_FILTER_FIELDS } from './constants';

const NESTED_FIELD_SUFFIX = 'Aggregation';

export interface QuickSearchFilterField extends TypedInputFieldBase<QuickSearchFilterField> {
    getFilterNode(sourceNode: QueryNode, filterValue: AnyValue, path: ReadonlyArray<Field>): QueryNode
}

function getDescription({ operator, typeName, fieldName }: { operator: string | undefined, typeName: string, fieldName?: string }) {
    let descriptionTemplate = QUICK_SEARCH_FILTER_DESCRIPTIONS[operator || INPUT_FIELD_EQUAL];
    if (typeof descriptionTemplate === 'object') {
        descriptionTemplate = descriptionTemplate[typeName] || descriptionTemplate[''];
    }
    return descriptionTemplate ? descriptionTemplate.replace(/\$field/g, fieldName ? '`' + fieldName + '`' : 'the value') : undefined;
}

export class QuickSearchScalarOrEnumFieldFilterField implements QuickSearchFilterField {
    public readonly inputType: GraphQLInputType;
    public readonly description: string | undefined;

    constructor(
        public readonly field: Field,
        public readonly resolveOperator: (fieldNode: QueryNode, valueNode: QueryNode, quickSearchLanguage?: QuickSearchLanguage) => QueryNode,
        public readonly operatorPrefix: string | undefined,
        baseInputType: GraphQLInputType,
        public readonly quickSearchLanguage?: QuickSearchLanguage
    ) {
        this.inputType = QUICK_SEARCH_OPERATORS_WITH_LIST_OPERAND.includes(operatorPrefix || '') ? new GraphQLList(new GraphQLNonNull(baseInputType)) : baseInputType;
        this.description = getDescription({ operator: operatorPrefix, fieldName: field.name, typeName: field.type.name });
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

    getFilterNode(sourceNode: QueryNode, filterValue: AnyValue, path: ReadonlyArray<Field>): QueryNode {
        const valueNode = new FieldPathQueryNode(sourceNode, path.concat(this.field));
        const literalNode = new LiteralQueryNode(filterValue);
        if ((this.operatorPrefix == undefined || this.operatorPrefix === '') && filterValue == null) {
            return new BinaryOperationQueryNode(
                this.resolveOperator(valueNode, literalNode, this.quickSearchLanguage),
                BinaryOperator.OR,
                not(new QuickSearchFieldExistsQueryNode(valueNode, this.quickSearchLanguage))
            );
        }
        if ((this.operatorPrefix == INPUT_FIELD_NOT) && filterValue == null) {
            return new BinaryOperationQueryNode(
                this.resolveOperator(valueNode, literalNode, this.quickSearchLanguage),
                BinaryOperator.AND,
                new QuickSearchFieldExistsQueryNode(valueNode, this.quickSearchLanguage)
            );
        }

        if(this.operatorPrefix == INPUT_FIELD_NOT_STARTS_WITH && (filterValue === "")){
            return new ConstBoolQueryNode(false);
        }
        if((this.operatorPrefix == INPUT_FIELD_STARTS_WITH || this.operatorPrefix == INPUT_FIELD_NOT_STARTS_WITH || STRING_TEXT_ANALYZER_FILTER_FIELDS.some(value => this.operatorPrefix === value)) && (filterValue == null || filterValue === "")){
            return new ConstBoolQueryNode(true);
        }



        return this.resolveOperator(valueNode, literalNode, this.quickSearchLanguage);


    }
}

export class QuickSearchScalarOrEnumFilterField implements QuickSearchFilterField {
    public readonly inputType: GraphQLInputType;
    public readonly description: string | undefined;

    constructor(
        public readonly field: Field,
        public readonly resolveOperator: (fieldNode: QueryNode, valueNode: QueryNode, quickSearchLanguage?: QuickSearchLanguage) => QueryNode,
        public readonly operatorName: string,
        baseInputType: GraphQLInputType,
        public readonly quickSearchLanguage?: QuickSearchLanguage
    ) {
        this.inputType = QUICK_SEARCH_OPERATORS_WITH_LIST_OPERAND.includes(operatorName) ? new GraphQLList(new GraphQLNonNull(baseInputType)) : baseInputType;
        this.description = getDescription({ operator: operatorName, typeName: getNamedType(baseInputType).name });
    }

    get name() {
        if (this.operatorName == undefined) {
            return this.field.name;
        }
        return this.field.name + NESTED_FIELD_SUFFIX + FILTER_FIELD_PREFIX_SEPARATOR + this.operatorName;
        // @MSF generate own type for aggregation of scalars instead of chaining the name
    }

    getFilterNode(sourceNode: QueryNode, filterValue: AnyValue, path: ReadonlyArray<Field>): QueryNode {
        const valueNode = new FieldPathQueryNode(sourceNode, path.concat(this.field));
        const literalNode = new LiteralQueryNode(filterValue);
        return this.resolveOperator(valueNode, literalNode, this.quickSearchLanguage);
    }
}

export class QuickSearchNestedObjectFilterField implements QuickSearchFilterField {
    readonly name: string;
    readonly description: string;

    constructor(
        public readonly field: Field,
        public readonly inputType: QuickSearchFilterObjectType
    ) {
        this.name = this.field.isList ? this.field.name + NESTED_FIELD_SUFFIX : this.field.name;
        this.description = `Checks if \`${this.field.name}\` is not null, and allows to filter based on its fields.`;
        if (this.field.isReference && this.field.type.kind == TypeKind.ROOT_ENTITY && this.field.type.keyField) {
            this.description = `Filters the through \`${this.field.type.keyField.name}\` referenced ${pluralize(this.field.type.name)} that fulfills the given requirements.\n\n ` + this.description;
        }
    }

    getFilterNode(sourceNode: QueryNode, filterValue: AnyValue, path: ReadonlyArray<Field>): QueryNode {
        // if path contains any Field twice
        if(path.some(value => path.filter(value1 => value == value1).length > 1)){
            return new RuntimeErrorQueryNode("Recursive filters can only be defined for one level of recursion.");
            // @MSF TODO: allow configuration of recursion depth
        }
        if (filterValue == null) {
            const valueNode = new FieldPathQueryNode(sourceNode, path.concat(this.field));
            const literalNode = new LiteralQueryNode(filterValue);
            const node = new BinaryOperationQueryNode(
                new BinaryOperationQueryNode(valueNode, BinaryOperator.EQUAL, literalNode),
                BinaryOperator.OR,
                not(new QuickSearchFieldExistsQueryNode(valueNode))
            );
            if (path.length > 0) {
                return new BinaryOperationQueryNode(
                    node,
                    BinaryOperator.AND,
                    new QuickSearchFieldExistsQueryNode(new FieldPathQueryNode(sourceNode, path))
                );
            } else {
                return node;
            }
        } else {
            return this.inputType.getFilterNode(sourceNode, filterValue, path.concat(this.field));
        }

    }

}

export class QuickSearchEntityExtensionFilterField implements QuickSearchFilterField {
    readonly name: string;
    readonly description: string;

    constructor(
        public readonly field: Field,
        public readonly inputType: QuickSearchFilterObjectType
    ) {

        this.name = this.field.isList ? this.field.name + NESTED_FIELD_SUFFIX : this.field.name;
        this.description = `Allows to filter on the fields of \`${this.field.name}\`.\n\nNote that \`${this.field.name}\` is an entity extension and thus can never be \`null\`, so specifying \`null\` to this filter field has no effect.`;
    }

    getFilterNode(sourceNode: QueryNode, filterValue: AnyValue, path: ReadonlyArray<Field>): QueryNode {
        if (filterValue == undefined) {
            // entity extensions can't ever be null, and null is always coerced to {}, so this filter just shouldn't have any effect
            return ConstBoolQueryNode.TRUE;
        }
        return this.inputType.getFilterNode(sourceNode, filterValue, path.concat(this.field));
    }

}

export class QuickSearchAndFilterField implements QuickSearchFilterField {
    readonly name: string;
    readonly description: string;
    readonly inputType: GraphQLInputType;

    constructor(
        public readonly filterType: QuickSearchFilterObjectType) {
        this.name = AND_FILTER_FIELD;
        this.description = `A field that checks if all filters in the list apply\n\nIf the list is empty, this filter applies to all objects.`;
        this.inputType = new GraphQLList(new GraphQLNonNull(filterType.getInputType()));
    }

    getFilterNode(sourceNode: QueryNode, filterValue: AnyValue, path: ReadonlyArray<Field>): QueryNode {
        if (!isArray(filterValue) || !filterValue.length) {
            return new ConstBoolQueryNode(true);
        }
        const values = (filterValue || []) as ReadonlyArray<PlainObject>;
        const nodes = values.map(value => this.filterType.getFilterNode(sourceNode, value, path));
        return nodes.reduce((prev, node) => new BinaryOperationQueryNode(prev, BinaryOperator.AND, node));
    }

}

export class QuickSearchOrFilterField implements QuickSearchFilterField {
    public readonly name: string;
    public readonly description?: string;
    public readonly inputType: GraphQLInputType;

    constructor(
        public readonly filterType: QuickSearchFilterObjectType) {
        this.name = OR_FILTER_FIELD;
        this.description = `A field that checks if any of the filters in the list apply.\n\nIf the list is empty, this filter applies to no objects.\n\nNote that only the items in the list *or*-combined; this complete \`OR\` field is *and*-combined with outer fields in the parent filter type.`;
        this.inputType = new GraphQLList(new GraphQLNonNull(filterType.getInputType()));
    }

    getFilterNode(sourceNode: QueryNode, filterValue: AnyValue, path: ReadonlyArray<Field>): QueryNode {
        if (!isArray(filterValue)) {
            return new ConstBoolQueryNode(true); // regard as omitted
        }
        const values = filterValue as ReadonlyArray<PlainObject>;
        if (!values.length) {
            return ConstBoolQueryNode.FALSE; // neutral element of OR
        }
        const nodes = values.map(value => this.filterType.getFilterNode(sourceNode, value, path));
        return nodes.reduce((prev, node) => new BinaryOperationQueryNode(prev, BinaryOperator.OR, node));
    }

}
