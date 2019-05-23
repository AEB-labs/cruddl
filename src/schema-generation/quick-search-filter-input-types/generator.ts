import { QuickSearchLanguage } from '../../model/config';
import { EnumType, Field, ObjectType, RootEntityType, ScalarType, Type } from '../../model/implementation';
import { AnyValue, flatMap, objectEntries } from '../../utils/utils';
import memorize from 'memorize-decorator';
import { EnumTypeGenerator } from '../enum-type-generator';
import { GraphQLEnumType, Thunk } from 'graphql';
import { resolveThunk } from '../query-node-object-type';
import { TypedInputObjectType } from '../typed-input-object-type';
import { getQuickSearchFilterTypeName, getQuickSearchGlobalFilterTypeName } from '../../schema/names';
import {
    BinaryOperationQueryNode,
    BinaryOperator,
    ConstBoolQueryNode, LiteralQueryNode,
    NullQueryNode,
    OrderDirection,
    QueryNode, OperatorWithLanguageQueryNode, BinaryOperatorWithLanguage
} from '../../query-tree';
import {
    AndFilterField,
    EntityExtensionFilterField,
    FilterField,
    NestedObjectFilterField,
    OrFilterField,
    ScalarOrEnumFieldFilterField,
    ScalarOrEnumFilterField
} from '../filter-input-types/filter-fields';
import {
    and,
    or,
    QUICK_SEARCH_FILTER_FIELDS_BY_TYPE,
    QUICK_SEARCH_FILTER_OPERATORS, SOME_PREFIX,
    STRING_TEXT_ANALYZER_FILTER_FIELDS
} from './constants';
import { ENUM_FILTER_FIELDS, FILTER_OPERATORS, not, binaryNotOpWithLanguage, binaryOpWithLanguage } from '../filter-input-types/constants';
import {
    INPUT_FIELD_CONTAINS_ALL_PREFIXES,
    INPUT_FIELD_CONTAINS_ALL_WORDS,
    INPUT_FIELD_CONTAINS_ANY_PREFIX,
    INPUT_FIELD_CONTAINS_ANY_WORD, INPUT_FIELD_CONTAINS_PHRASE,
    INPUT_FIELD_EQUAL,
    INPUT_FIELD_NOT_CONTAINS_ALL_PREFIXES,
    INPUT_FIELD_NOT_CONTAINS_ALL_WORDS,
    INPUT_FIELD_NOT_CONTAINS_ANY_PREFIX,
    INPUT_FIELD_NOT_CONTAINS_ANY_WORD, INPUT_FIELD_NOT_CONTAINS_PHRASE
} from '../../schema/constants';
import { OrderByEnumValue } from '../order-by-enum-generator';
import { SystemFieldOrderByEnumType } from '../quick-search-global-generator';
import { simplifyBooleans } from '../../query-tree/utils';

export class QuickSearchFilterObjectType extends TypedInputObjectType<FilterField> {
    constructor(
        type: Type,
        fields: Thunk<ReadonlyArray<FilterField>>
    ) {
        super(getQuickSearchFilterTypeName(type.name), fields, `QuickSearchFilter type for \`${type.name}\`.\n\nAll fields in this type are *and*-combined; see the \`or\` field for *or*-combination.`);
    }

    getFilterNode(sourceNode: QueryNode, filterValue: AnyValue): QueryNode {
        if (typeof filterValue !== 'object' || filterValue === null) {
            return new BinaryOperationQueryNode(sourceNode, BinaryOperator.EQUAL, NullQueryNode.NULL);
        }
        const filterNodes = objectEntries(filterValue)
            .map(([name, value]) => this.getFieldOrThrow(name).getFilterNode(sourceNode, value));
        return filterNodes.reduce(and, ConstBoolQueryNode.TRUE);

    }

    getSearchFilterNode(sourceNode: QueryNode, expression: string | undefined): QueryNode {
        if (!expression) {
            return new ConstBoolQueryNode(true);
        }
        return this.fields.filter(value => (value.isValidForQuickSearch()))
            .map(value => value.getQuickSearchFilterNode(sourceNode, expression))
            .reduce(or, ConstBoolQueryNode.FALSE);

    }
}

export class QuickSearchFilterTypeGenerator {

    constructor(private enumTypeGenerator: EnumTypeGenerator) {
    }

    @memorize()
    generate(type: ObjectType): QuickSearchFilterObjectType {
        return this.generateQuickSearchFilterType(type, () => {
            return flatMap(
                type.fields.filter(value => value.isQuickSearchIndexed || value.isQuickSearchFulltextIndexed),
                (field: Field) => this.generateFieldQuickSearchFilterFields(field)
            );
        });

    }

    private generateQuickSearchFilterType(type: Type, fields: Thunk<ReadonlyArray<FilterField>>): QuickSearchFilterObjectType {
        function getFields(): ReadonlyArray<FilterField> {
            return [
                ...resolveThunk(fields),
                new AndFilterField(filterType),
                new OrFilterField(filterType)
            ];
        }

        const filterType = new QuickSearchFilterObjectType(type, getFields);
        return filterType;
    }

    public generateFieldQuickSearchFilterFields(field: Field): ReadonlyArray<FilterField> {
        if (field.isList) {
            return this.generateListFieldFilterFields(field, []);
        }
        if (field.type.isScalarType) {
            return this.generateFilterFieldsForNonListScalar(field);
        }
        if (field.type.isObjectType) {
            const inputType = this.generate(field.type);
            if (field.type.isEntityExtensionType) {
                return [new EntityExtensionFilterField(field, inputType)];
            } else {
                return [new NestedObjectFilterField(field, inputType)];
            }
        }
        if (field.type.isEnumType) {
            const graphQLEnumType = this.enumTypeGenerator.generate(field.type);
            return this.generateFilterFieldsForEnumField(field, graphQLEnumType);
        }
        return [];
    }

    private generateFilterFieldsForNonListScalar(field: Field): ReadonlyArray<FilterField> {
        // @MSF VAL TODO: validate languages only for strings
        if (field.isList || !field.type.isScalarType) {
            throw new Error(`Expected "${field.name}" to be a non-list scalar`);
        }

        const filterFields = QUICK_SEARCH_FILTER_FIELDS_BY_TYPE[field.type.graphQLScalarType.name] || [];
        const inputType = field.type.graphQLScalarType;
        let scalarFields: FilterField[] = [];
        if (field.isQuickSearchIndexed) {
            scalarFields = scalarFields.concat(filterFields
                .map(name => new ScalarOrEnumFieldFilterField(field, QUICK_SEARCH_FILTER_OPERATORS[name], name === INPUT_FIELD_EQUAL ? undefined : name, inputType, undefined)));
        }

        if (field.language && field.isQuickSearchFulltextIndexed) {
            scalarFields = scalarFields.concat(
                STRING_TEXT_ANALYZER_FILTER_FIELDS.map(name => new ScalarOrEnumFieldFilterField(field, this.getComplexFilterOperatorByName(name), name, inputType, field.language))
            );
        }
        return scalarFields;
    }

    private getComplexFilterOperatorByName(name: string): (fieldNode: QueryNode, valueNode: QueryNode, quickSearchLanguage?: QuickSearchLanguage) => QueryNode {
        switch (name) {
            case INPUT_FIELD_CONTAINS_ANY_WORD:
                return binaryOpWithLanguage(BinaryOperatorWithLanguage.QUICKSEARCH_CONTAINS_ANY_WORD);
            case INPUT_FIELD_NOT_CONTAINS_ANY_WORD:
                return binaryNotOpWithLanguage(BinaryOperatorWithLanguage.QUICKSEARCH_CONTAINS_ANY_WORD);
            case INPUT_FIELD_CONTAINS_ALL_WORDS:
                return (fieldNode: QueryNode, valueNode: QueryNode, quickSearchLanguage?: QuickSearchLanguage) =>
                    this.generateComplexFilterOperator(BinaryOperatorWithLanguage.QUICKSEARCH_CONTAINS_ANY_WORD, BinaryOperator.AND, fieldNode, valueNode, quickSearchLanguage);
            case INPUT_FIELD_NOT_CONTAINS_ALL_WORDS:
                return (fieldNode: QueryNode, valueNode: QueryNode, quickSearchLanguage?: QuickSearchLanguage) =>
                    not(this.generateComplexFilterOperator(BinaryOperatorWithLanguage.QUICKSEARCH_CONTAINS_ANY_WORD, BinaryOperator.AND, fieldNode, valueNode, quickSearchLanguage));
            case INPUT_FIELD_CONTAINS_ANY_PREFIX:
                return (fieldNode: QueryNode, valueNode: QueryNode, quickSearchLanguage?: QuickSearchLanguage) =>
                    this.generateComplexFilterOperator(BinaryOperatorWithLanguage.QUICKSEARCH_CONTAINS_PREFIX, BinaryOperator.OR, fieldNode, valueNode, quickSearchLanguage);
            case INPUT_FIELD_NOT_CONTAINS_ANY_PREFIX:
                return (fieldNode: QueryNode, valueNode: QueryNode, quickSearchLanguage?: QuickSearchLanguage) =>
                    not(this.generateComplexFilterOperator(BinaryOperatorWithLanguage.QUICKSEARCH_CONTAINS_PREFIX, BinaryOperator.OR, fieldNode, valueNode, quickSearchLanguage));
            case INPUT_FIELD_CONTAINS_ALL_PREFIXES:
                return (fieldNode: QueryNode, valueNode: QueryNode, quickSearchLanguage?: QuickSearchLanguage) =>
                    this.generateComplexFilterOperator(BinaryOperatorWithLanguage.QUICKSEARCH_CONTAINS_PREFIX, BinaryOperator.AND, fieldNode, valueNode, quickSearchLanguage);
            case INPUT_FIELD_NOT_CONTAINS_ALL_PREFIXES:
                return (fieldNode: QueryNode, valueNode: QueryNode, quickSearchLanguage?: QuickSearchLanguage) =>
                    not(this.generateComplexFilterOperator(BinaryOperatorWithLanguage.QUICKSEARCH_CONTAINS_PREFIX, BinaryOperator.AND, fieldNode, valueNode, quickSearchLanguage));
            case INPUT_FIELD_CONTAINS_PHRASE:
                return binaryOpWithLanguage(BinaryOperatorWithLanguage.QUICKSEARCH_CONTAINS_PHRASE);
            case INPUT_FIELD_NOT_CONTAINS_PHRASE:
                return binaryNotOpWithLanguage(BinaryOperatorWithLanguage.QUICKSEARCH_CONTAINS_PHRASE);
            default:
                throw new Error(`Complex Filter for '${name}' is not defined.`);
        }
    }

    private generateComplexFilterOperator(comparisonOperator: BinaryOperatorWithLanguage, logicalOperator: BinaryOperator, fieldNode: QueryNode, valueNode: QueryNode, quickSearchLanguage?: QuickSearchLanguage) {
        if (!(valueNode instanceof LiteralQueryNode) || (typeof valueNode.value !== 'string')) {
            throw new Error('QuickSearchComplexFilters requires a LiteralQueryNode with a string-value, as valueNode');
        }
        const tokens = this.tokenize(valueNode.value);
        const neutralOperand = logicalOperator === BinaryOperator.AND ? ConstBoolQueryNode.TRUE : ConstBoolQueryNode.FALSE;
        return simplifyBooleans(tokens
            .map(value => new OperatorWithLanguageQueryNode(fieldNode, comparisonOperator, new LiteralQueryNode(value), quickSearchLanguage))
            .reduce(and, neutralOperand));
    }

    @memorize()
    private tokenize(value: string): string[] {
        return flatMap(value.split(' '), t => t.split('-'));
        //  @MSF TODO: implement tokenization
    }

    private generateFilterFieldsForEnumField(field: Field, graphQLEnumType: GraphQLEnumType): FilterField[] {
        if (field.isList || !field.type.isEnumType) {
            throw new Error(`Expected "${field.name}" to be a non-list enum`);
        }
        return ENUM_FILTER_FIELDS.map(name =>
            new ScalarOrEnumFieldFilterField(
                field,
                FILTER_OPERATORS[name],
                name === INPUT_FIELD_EQUAL ? undefined : name, graphQLEnumType,
                field.isQuickSearchIndexed ? field.language : undefined));
    }

    @memorize()
    private generateListFieldFilterFields(field: Field, prefix: Field[]): FilterField[] {

        if (field.type instanceof ScalarType) {
            return this.buildScalarFilterFields(field.type, prefix.map(value => value.name).concat([
                field.name, SOME_PREFIX
            ]), field, prefix);
        } else if (field.type instanceof EnumType) {
            return this.buildEnumFilterFields(field.type, prefix.map(value => value.name).concat([
                field.name, SOME_PREFIX
            ]), field, prefix);
        } else {
            return flatMap(field.type.fields.filter(nestedField => {
                return (nestedField.isQuickSearchIndexed || nestedField.isQuickSearchFulltextIndexed) && !prefix.includes(field);
            }), (nestedField) => {
                return this.generateListFieldFilterFields(nestedField, prefix.concat([field]));
            });
        }
    }


    private buildScalarFilterFields(type: ScalarType, prefix: string[] = [], field: Field, path?: Field[]): ScalarOrEnumFilterField[] {
        const filterFields = QUICK_SEARCH_FILTER_FIELDS_BY_TYPE[type.name] || [];

        let scalarFields: ScalarOrEnumFilterField[] = [];
        if (field.isQuickSearchIndexed) {
            scalarFields = scalarFields.concat(filterFields.map(name => new ScalarOrEnumFilterField(QUICK_SEARCH_FILTER_OPERATORS[name], prefix.concat([name]).join('_'), type.graphQLScalarType, field, path)));
        }

        if (field.language && field.isQuickSearchFulltextIndexed) {
            scalarFields = scalarFields.concat(STRING_TEXT_ANALYZER_FILTER_FIELDS.map(name =>
                new ScalarOrEnumFilterField(
                    this.getComplexFilterOperatorByName(name),
                    prefix.concat([name]).join('_'),
                    type.graphQLScalarType,
                    field,
                    path,
                    field.language)));
        }

        return scalarFields;

    }

    private buildEnumFilterFields(type: EnumType, prefix: string[] = [], field: Field, path?: Field[]) {
        return ENUM_FILTER_FIELDS.map(name => new ScalarOrEnumFilterField(QUICK_SEARCH_FILTER_OPERATORS[name], prefix.concat([name]).join('_'), this.enumTypeGenerator.generate(type), field, path));
    }

    @memorize()
    generateSystemFieldOrderByEnum(type: RootEntityType): SystemFieldOrderByEnumType {
        // @MSF TODO look for cleaner solution to select system fields instead of using the first type
        const systemfields = type.fields.filter(value => value.isSystemField);

        function mapToOrderByEnumValues(value: Field) {
            return [
                new OrderByEnumValue([value], OrderDirection.ASCENDING),
                new OrderByEnumValue([value], OrderDirection.DESCENDING)
            ];
        }

        return new SystemFieldOrderByEnumType(flatMap(systemfields, mapToOrderByEnumValues));
    }

    private getValues(type: ObjectType, path: ReadonlyArray<Field>): ReadonlyArray<OrderByEnumValue> {
        return flatMap(type.fields, field => this.getValuesForField(field, path));
    }

    private getValuesForField(field: Field, path: ReadonlyArray<Field>) {
        // Don't recurse
        if (path.includes(field)) {
            return [];
        }

        // can't sort by list value
        if (field.isList) {
            return [];
        }

        const newPath = [...path, field];
        if (field.type.isObjectType) {
            return this.getValues(field.type, newPath);
        } else {
            // currently, all scalars and enums are ordered types
            return [
                new OrderByEnumValue(newPath, OrderDirection.ASCENDING),
                new OrderByEnumValue(newPath, OrderDirection.DESCENDING)
            ];
        }
    }
}