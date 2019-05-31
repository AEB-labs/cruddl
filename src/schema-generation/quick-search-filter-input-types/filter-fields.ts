import { getNamedType, GraphQLInputType, GraphQLList, GraphQLNonNull } from 'graphql';
import * as pluralize from 'pluralize';
import { isArray } from 'util';
import { Field, QuickSearchLanguage, TypeKind } from '../../model';
import { BinaryOperationQueryNode, BinaryOperator, ConstBoolQueryNode, FieldPathQueryNode, LiteralQueryNode, NullQueryNode, QueryNode } from '../../query-tree';
import { AND_FILTER_FIELD, FILTER_FIELD_PREFIX_SEPARATOR, INPUT_FIELD_EQUAL, OR_FILTER_FIELD } from '../../schema/constants';
import { AnyValue, flatMap, objectEntries, PlainObject } from '../../utils/utils';
import { createFieldNode } from '../field-nodes';
import { QuickSearchFilterObjectType } from '../quick-search-filter-input-types/generator';
import { TypedInputFieldBase } from '../typed-input-object-type';
import { and, QUICK_SEARCH_FILTER_DESCRIPTIONS, QUICK_SEARCH_OPERATORS_WITH_LIST_OPERAND } from './constants';


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
        return this.operatorName;
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
        this.name = this.field.name + NESTED_FIELD_SUFFIX;
        this.description = `Checks if \`${this.field.name}\` is not null, and allows to filter based on its fields.`;
        if (this.field.isReference && this.field.type.kind == TypeKind.ROOT_ENTITY && this.field.type.keyField) {
            this.description = `Filters the through \`${this.field.type.keyField.name}\` referenced ${pluralize(this.field.type.name)} that fulfills the given requirements.\n\n ` + this.description;
        }
    }

    getFilterNode(sourceNode: QueryNode, filterValue: AnyValue, path: ReadonlyArray<Field>): QueryNode {
        // return this.getNode(sourceNode,[this.field],filterValue).reduce(and,ConstBoolQueryNode.FALSE);
        return this.inputType.getFilterNode(sourceNode, filterValue, path.concat(this.field));
    }

    // getNode(sourceNode: QueryNode, path: ReadonlyArray<Field>, filterValue: AnyValue):ReadonlyArray<QueryNode> {
    //     if (typeof filterValue !== 'object' || filterValue === null) {
    //         throw new Error("")
    //     }
    //
    //     const fieldFilterValue = filterValue[field.]
    //
    //     if (typeof filterValue !== 'object' || filterValue === null) {
    //         return [new BinaryOperationQueryNode(new FieldPathQueryNode(sourceNode,path), BinaryOperator.EQUAL, NullQueryNode.NULL)];
    //     }
    //     const field = path[path.length-1];
    //     if(field.type.isObjectType){
    //         return flatMap(field.type.fields, value => this.getNode(sourceNode,path.concat(value),filterValue));
    //     }
    //
    //     objectEntries(filterValue)
    //     if(field.type.isEnumType){
    //         return [new BinaryOperationQueryNode(sourceNode,BinaryOperator.EQUAL, new LiteralQueryNode(filterValue))]
    //     }
    //     return [new FieldPathQueryNode(sourceNode,path)]
    //
    // }

}

export class QuickSearchEntityExtensionFilterField implements QuickSearchFilterField {
    readonly name: string;
    readonly description: string;

    constructor(
        public readonly field: Field,
        public readonly inputType: QuickSearchFilterObjectType
    ) {

        this.name = this.field.name + NESTED_FIELD_SUFFIX;
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
