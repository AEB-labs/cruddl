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
import { FILTER_DESCRIPTIONS, OPERATORS_WITH_LIST_OPERAND, Quantifier } from './constants';
import { FilterObjectType } from './generator';
import { QuickSearchFilterObjectType } from '../quick-search-filter-input-types/generator';

export interface FilterField extends TypedInputFieldBase<FilterField> {
    getFilterNode(sourceNode: QueryNode, filterValue: AnyValue): QueryNode

    getQuickSearchFilterNode(sourceNode: QueryNode, expression: string): QueryNode

    isValidForQuickSearch(): boolean
}

function getDescription({ operator, typeName, fieldName }: { operator: string | undefined, typeName: string, fieldName?: string }) {
    let descriptionTemplate = FILTER_DESCRIPTIONS[operator || INPUT_FIELD_EQUAL];
    if (typeof descriptionTemplate === 'object') {
        descriptionTemplate = descriptionTemplate[typeName] || descriptionTemplate[''];
    }
    return descriptionTemplate ? descriptionTemplate.replace(/\$field/g, fieldName ? '`' + fieldName + '`' : 'the value') : undefined;
}

export class ScalarOrEnumFieldFilterField implements FilterField {
    public readonly inputType: GraphQLInputType;
    public readonly description: string | undefined;

    constructor(
        public readonly field: Field,
        public readonly resolveOperator: (fieldNode: QueryNode, valueNode: QueryNode, quickSearchLanguage?: QuickSearchLanguage) => QueryNode,
        public readonly operatorPrefix: string | undefined,
        baseInputType: GraphQLInputType,
        public readonly quickSearchLanguage?: QuickSearchLanguage
    ) {
        this.inputType = OPERATORS_WITH_LIST_OPERAND.includes(operatorPrefix || '') ? new GraphQLList(new GraphQLNonNull(baseInputType)) : baseInputType;
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

    getQuickSearchFilterNode(sourceNode: QueryNode, expression: string): QueryNode {
        if (this.isValidForQuickSearch()) {
            return this.getFilterNode(sourceNode, expression);
        } else {
            return new ConstBoolQueryNode(false);
        }

    }


    isValidForQuickSearch(): boolean {
        return this.field.isSearchable && (this.operatorPrefix == undefined || this.operatorPrefix == INPUT_FIELD_CONTAINS_ALL_PREFIXES);
    }
}

export class ScalarOrEnumFilterField implements FilterField {
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
        this.inputType = OPERATORS_WITH_LIST_OPERAND.includes(operatorName) ? new GraphQLList(new GraphQLNonNull(baseInputType)) : baseInputType;
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

    getQuickSearchFilterNode(sourceNode: QueryNode, expression: string): QueryNode {
        if (this.isValidForQuickSearch()) {
            return this.getFilterNode(sourceNode, expression);
        } else {
            return new ConstBoolQueryNode(false);
        }
    }

    isValidForQuickSearch(): boolean {
        return !!this.field && this.field.isSearchable && this.operatorName.endsWith('some_equal');
    } // @MSF OPT TODO: properly check for operator
}

export class QuantifierFilterField implements FilterField {
    readonly name: string;

    constructor(
        public readonly field: Field,
        public readonly quantifierName: Quantifier,
        public readonly inputType: FilterObjectType
    ) {
        this.name = `${this.field.name}_${this.quantifierName}`;
    }

    get description(): string | undefined {
        switch (this.quantifierName) {
            case 'every':
                return `Makes sure all items in \`${this.field.name}\` match a certain filter.`;
            case 'none':
                return `Makes sure none of the items in \`${this.field.name}\` match a certain filter.\n\n` +
                    `Note that you can specify the empty object for this filter to make sure \`${this.field.name}\` has no items.`;
            case 'some':
                return `Makes sure at least one of the items in "${this.field.name}" matches a certain filter.\n\n` +
                    `Note that you can specify the empty object for this filter to make sure \`${this.field.name}\` has at least one item.`;
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
            conditionNode: filterNode
        });
    }

    getQuickSearchFilterNode(sourceNode: QueryNode, expression: string): QueryNode {
        return new ConstBoolQueryNode(false); // Not required for QuickSearch
    }

    isValidForQuickSearch(): boolean {
        return false;
    }
}

export class NestedObjectFilterField implements FilterField {
    readonly name: string;
    readonly description: string;

    constructor(
        public readonly field: Field,
        public readonly inputType: FilterObjectType | QuickSearchFilterObjectType
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

    getQuickSearchFilterNode(sourceNode: QueryNode, expression: string): QueryNode {
        if (this.inputType instanceof QuickSearchFilterObjectType) {
            return this.inputType.getSearchFilterNode(createFieldNode(this.field, sourceNode), expression);
        } else {
            return new ConstBoolQueryNode(false);
        }
    }

    isValidForQuickSearch(): boolean {
        return this.field.isSearchable && this.inputType instanceof QuickSearchFilterObjectType;
    }
}

export class EntityExtensionFilterField implements FilterField {
    readonly name: string;
    readonly description: string;

    constructor(
        public readonly field: Field,
        public readonly inputType: FilterObjectType | QuickSearchFilterObjectType
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

    getQuickSearchFilterNode(sourceNode: QueryNode, expression: string): QueryNode {
        if (this.inputType instanceof QuickSearchFilterObjectType) {
            return this.inputType.getSearchFilterNode(createFieldNode(this.field, sourceNode), expression);
        } else {
            return new ConstBoolQueryNode(false);
        }
    }

    isValidForQuickSearch(): boolean {
        return this.field.isSearchable && this.inputType instanceof QuickSearchFilterObjectType;
    }
}

export interface ListFilterField extends FilterField {
    readonly inputType: FilterObjectType
    readonly field: Field
}

export class AndFilterField implements FilterField {
    readonly name: string;
    readonly description: string;
    readonly inputType: GraphQLInputType;

    constructor(
        public readonly filterType: FilterObjectType | QuickSearchFilterObjectType) {
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

    getQuickSearchFilterNode(sourceNode: QueryNode, expression: string): QueryNode {
        return new ConstBoolQueryNode(false); // not required for quickSearch
    }

    isValidForQuickSearch(): boolean {
        return false;
    }
}

export class OrFilterField implements FilterField {
    public readonly name: string;
    public readonly description?: string;
    public readonly inputType: GraphQLInputType;

    constructor(
        public readonly filterType: FilterObjectType | QuickSearchFilterObjectType) {
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

    getQuickSearchFilterNode(sourceNode: QueryNode, expression: string): QueryNode {
        return new ConstBoolQueryNode(false); // not required for quickSearch
    }

    isValidForQuickSearch(): boolean {
        return false;
    }
}
