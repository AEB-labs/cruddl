import { getNamedType, GraphQLInputType, GraphQLList, GraphQLNonNull } from 'graphql';
import * as pluralize from 'pluralize';
import { isArray } from 'util';
import { Field, QuickSearchLanguage, TypeKind } from '../../model';
import {
    BinaryOperationQueryNode,
    BinaryOperator,
    ConstBoolQueryNode, FieldPathQueryNode,
    FieldQueryNode,
    LiteralQueryNode,
    QueryNode,
    VariableQueryNode
} from '../../query-tree';
import { QuantifierFilterNode } from '../../query-tree/quantifiers';
import {
    AND_FILTER_FIELD,
    FILTER_FIELD_PREFIX_SEPARATOR, INPUT_FIELD_CONTAINS_ALL_PREFIXES, INPUT_FIELD_CONTAINS_ANY_PREFIX,
    INPUT_FIELD_CONTAINS_ANY_WORD,
    INPUT_FIELD_EQUAL, INPUT_FIELD_STARTS_WITH,
    OR_FILTER_FIELD
} from '../../schema/constants';
import { AnyValue, decapitalize, PlainObject } from '../../utils/utils';
import { createFieldNode } from '../field-nodes';
import { TypedInputFieldBase } from '../typed-input-object-type';
import { QuickSearchFilterObjectType } from '../quick-search-filter-input-types/generator';
import { QUICK_SEARCH_FILTER_DESCRIPTIONS, QUICK_SEARCH_OPERATORS_WITH_LIST_OPERAND } from './constants';
// @MSF TODO: own FilterFields for QuickSearch
export interface QuickSearchFilterField extends TypedInputFieldBase<QuickSearchFilterField> {
    getFilterNode(sourceNode: QueryNode, filterValue: AnyValue): QueryNode

    getSearchFilterNode(sourceNode: QueryNode, expression: string): QueryNode

    isValidForSearch(): boolean
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

    getFilterNode(sourceNode: QueryNode, filterValue: AnyValue): QueryNode {
        const valueNode = createFieldNode(this.field, sourceNode);
        const literalNode = new LiteralQueryNode(filterValue);
        return this.resolveOperator(valueNode, literalNode, this.quickSearchLanguage);
    }

    getSearchFilterNode(sourceNode: QueryNode, expression: string): QueryNode {
        if (this.isValidForSearch()) {
            return this.getFilterNode(sourceNode, expression);
        } else {
            return new ConstBoolQueryNode(false);
        }

    }


    isValidForSearch(): boolean {
        return this.field.isSearchable && (this.operatorPrefix == undefined || this.operatorPrefix == INPUT_FIELD_CONTAINS_ALL_PREFIXES);
    }
}

export class QuickSearchScalarOrEnumFilterField implements QuickSearchFilterField {
    public readonly inputType: GraphQLInputType;
    public readonly description: string | undefined;

    constructor(
        public readonly resolveOperator: (fieldNode: QueryNode, valueNode: QueryNode, quickSearchLanguage?: QuickSearchLanguage) => QueryNode,
        public readonly operatorName: string,
        baseInputType: GraphQLInputType,
        private readonly field?: Field, // only filled for quickSearch
        private readonly path?: Field[], // only filled for quickSearch
        public readonly quickSearchLanguage?: QuickSearchLanguage
    ) {
        this.inputType = QUICK_SEARCH_OPERATORS_WITH_LIST_OPERAND.includes(operatorName) ? new GraphQLList(new GraphQLNonNull(baseInputType)) : baseInputType;
        this.description = getDescription({ operator: operatorName, typeName: getNamedType(baseInputType).name });
    }

    get name() {
        return this.operatorName;
    }

    getFilterNode(sourceNode: QueryNode, filterValue: AnyValue): QueryNode {
        if (this.field) {
            const valueNode = new FieldPathQueryNode(sourceNode, this.path ?  this.path.concat([this.field]) : [this.field]);
            const literalNode = new LiteralQueryNode(filterValue);
            return this.resolveOperator(valueNode, literalNode,this.quickSearchLanguage);
        } else {
            const literalNode = new LiteralQueryNode(filterValue);
            return this.resolveOperator(sourceNode, literalNode, this.quickSearchLanguage);
        }

    }

    getSearchFilterNode(sourceNode: QueryNode, expression: string): QueryNode {
        if (this.isValidForSearch()) {
            return this.getFilterNode(sourceNode, expression);
        } else {
            return new ConstBoolQueryNode(false);
        }
    }

    isValidForSearch(): boolean {
        return !!this.field && this.field.isSearchable && this.operatorName.endsWith('some_equal');
    } // @MSF OPT TODO: properly check for operator
}

export class QuickSearchNestedObjectFilterField implements QuickSearchFilterField {
    readonly name: string;
    readonly description: string;

    constructor(
        public readonly field: Field,
        public readonly inputType: QuickSearchFilterObjectType
    ) {
        this.name = this.field.name;
        this.description = `Checks if \`${this.field.name}\` is not null, and allows to filter based on its fields.`;
        if (this.field.isReference && this.field.type.kind == TypeKind.ROOT_ENTITY && this.field.type.keyField) {
            this.description = `Filters the through \`${this.field.type.keyField.name}\` referenced ${pluralize(this.field.type.name)} that fulfills the given requirements.\n\n ` + this.description;
        }
    }

    getFilterNode(sourceNode: QueryNode, filterValue: AnyValue): QueryNode {
        return this.inputType.getFilterNode(createFieldNode(this.field, sourceNode), filterValue);
    }

    getSearchFilterNode(sourceNode: QueryNode, expression: string): QueryNode {
        if (this.inputType instanceof QuickSearchFilterObjectType) {
            return this.inputType.getSearchFilterNode(createFieldNode(this.field, sourceNode), expression);
        } else {
            return new ConstBoolQueryNode(false);
        }
    }

    isValidForSearch(): boolean {
        return this.field.isSearchable && this.inputType instanceof QuickSearchFilterObjectType;
    }
}

export class QuickSearchEntityExtensionFilterField implements QuickSearchFilterField {
    readonly name: string;
    readonly description: string;

    constructor(
        public readonly field: Field,
        public readonly inputType: QuickSearchFilterObjectType
    ) {
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

    getSearchFilterNode(sourceNode: QueryNode, expression: string): QueryNode {
        if (this.inputType instanceof QuickSearchFilterObjectType) {
            return this.inputType.getSearchFilterNode(createFieldNode(this.field, sourceNode), expression);
        } else {
            return new ConstBoolQueryNode(false);
        }
    }

    isValidForSearch(): boolean {
        return this.field.isSearchable && this.inputType instanceof QuickSearchFilterObjectType;
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

    getFilterNode(sourceNode: QueryNode, filterValue: AnyValue): QueryNode {
        if (!isArray(filterValue) || !filterValue.length) {
            return new ConstBoolQueryNode(true);
        }
        const values = (filterValue || []) as ReadonlyArray<PlainObject>;
        const nodes = values.map(value => this.filterType.getFilterNode(sourceNode, value));
        return nodes.reduce((prev, node) => new BinaryOperationQueryNode(prev, BinaryOperator.AND, node));
    }

    getSearchFilterNode(sourceNode: QueryNode, expression: string): QueryNode {
        return new ConstBoolQueryNode(false); // not required for quickSearch
    }

    isValidForSearch(): boolean {
        return false;
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

    getFilterNode(sourceNode: QueryNode, filterValue: AnyValue): QueryNode {
        if (!isArray(filterValue)) {
            return new ConstBoolQueryNode(true); // regard as omitted
        }
        const values = filterValue as ReadonlyArray<PlainObject>;
        if (!values.length) {
            return ConstBoolQueryNode.FALSE; // neutral element of OR
        }
        const nodes = values.map(value => this.filterType.getFilterNode(sourceNode, value));
        return nodes.reduce((prev, node) => new BinaryOperationQueryNode(prev, BinaryOperator.OR, node));
    }

    getSearchFilterNode(sourceNode: QueryNode, expression: string): QueryNode {
        return new ConstBoolQueryNode(false); // not required for quickSearch
    }

    isValidForSearch(): boolean {
        return false;
    }
}
