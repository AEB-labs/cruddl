import { QuickSearchLanguage } from '../../model/config';
import { EnumType, Field, ObjectType, RootEntityType, ScalarType, Type } from '../../model/implementation';
import { QuickSearchComplexOperatorQueryNode } from '../../query-tree/quick-search';
import { AnyValue, flatMap, objectEntries } from '../../utils/utils';
import memorize from 'memorize-decorator';
import { EnumTypeGenerator } from '../enum-type-generator';
import { GraphQLEnumType, Thunk } from 'graphql';
import { QueryNodeResolveInfo, resolveThunk } from '../query-node-object-type';
import { TypedInputObjectType } from '../typed-input-object-type';
import { getQuickSearchFilterTypeName } from '../../schema/names';
import {
    BinaryOperationQueryNode,
    BinaryOperator,
    ConstBoolQueryNode, LiteralQueryNode,
    NullQueryNode,
    OrderDirection,
    QueryNode, OperatorWithLanguageQueryNode, BinaryOperatorWithLanguage, RuntimeErrorQueryNode
} from '../../query-tree';
import { and, binaryNotOpWithLanguage, binaryOpWithLanguage, noLanguageWasSuppliedError, not } from '../utils/input-types';
import {
    QUICK_SEARCH_FILTER_FIELDS_BY_TYPE,
    QUICK_SEARCH_FILTER_OPERATORS, SOME_PREFIX,
    STRING_TEXT_ANALYZER_FILTER_FIELDS
} from './constants';
import { ENUM_FILTER_FIELDS, FILTER_OPERATORS } from '../filter-input-types/constants';
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
import { simplifyBooleans } from '../../query-tree/utils';
import { QuickSearchAndFilterField, QuickSearchEntityExtensionFilterField, QuickSearchFilterField, QuickSearchNestedObjectFilterField, QuickSearchOrFilterField, QuickSearchScalarOrEnumFieldFilterField, QuickSearchScalarOrEnumFilterField } from './filter-fields';

export class QuickSearchFilterObjectType extends TypedInputObjectType<QuickSearchFilterField> {
    constructor(
        type: Type,
        fields: Thunk<ReadonlyArray<QuickSearchFilterField>>,
        public readonly isAggregration: boolean
    ) {
        super(getQuickSearchFilterTypeName(type.name, isAggregration), fields,
            `QuickSearchFilter type for \`${type.name}\`.\n\nAll fields in this type are *and*-combined; see the \`or\` field for *or*-combination.\n`+
            `Large queries in conjunctive normal form (e.g. (a OR b) AND (c OR d)... ) and should be avoided.`);
    }

    getFilterNode(sourceNode: QueryNode, filterValue: AnyValue, path: ReadonlyArray<Field>, info: QueryNodeResolveInfo): QueryNode {
        if (typeof filterValue !== 'object' || filterValue === null) {
            return new BinaryOperationQueryNode(sourceNode, BinaryOperator.EQUAL, NullQueryNode.NULL);
        }
        const filterNodes = objectEntries(filterValue as any)
            .map(([name, value]) => this.getFieldOrThrow(name).getFilterNode(sourceNode, value, path, info));
        return filterNodes.reduce(and, ConstBoolQueryNode.TRUE);

    }

}

export class QuickSearchFilterTypeGenerator {

    constructor(private enumTypeGenerator: EnumTypeGenerator) {
    }

    @memorize()
    generate(type: ObjectType, isAggregation: boolean): QuickSearchFilterObjectType {
        const quickSearchFilterObjectType = this.generateQuickSearchFilterType(type, () => {
            return flatMap(
                type.fields.filter(value => value.isQuickSearchIndexed || value.isQuickSearchFulltextIndexed),
                (field: Field) => this.generateFieldQuickSearchFilterFields(field, isAggregation)
            );
        }, isAggregation);
        return quickSearchFilterObjectType;

    }

    private generateQuickSearchFilterType(type: Type, fields: Thunk<ReadonlyArray<QuickSearchFilterField>>, isAggregation: boolean): QuickSearchFilterObjectType {
        function getFields(): ReadonlyArray<QuickSearchFilterField> {
            const filterFields = [
                ...resolveThunk(fields)
            ];
            if (!isAggregation) {
                return filterFields.concat([
                    new QuickSearchAndFilterField(filterType), new QuickSearchOrFilterField(filterType)
                ]);
            } else {
                return filterFields;
            }

        }

        const filterType = new QuickSearchFilterObjectType(type, getFields, isAggregation);
        return filterType;
    }

    public generateFieldQuickSearchFilterFields(field: Field, isAggregation: boolean): ReadonlyArray<QuickSearchFilterField> {
        if (field.isList) {
            return this.generateListFieldFilterFields(field);
        }
        if (field.type.isScalarType) {
            return this.generateFilterFieldsForNonListScalar(field);
        }
        if (field.type.isObjectType) {
            const inputType = this.generate(field.type, isAggregation);
            if (field.type.isEntityExtensionType) {
                return [new QuickSearchEntityExtensionFilterField(field, inputType)];
            } else {
                return [new QuickSearchNestedObjectFilterField(field, inputType)];
            }
        }
        if (field.type.isEnumType) {
            const graphQLEnumType = this.enumTypeGenerator.generate(field.type);
            return this.generateFilterFieldsForEnumField(field, graphQLEnumType);
        }
        return [];
    }

    private generateFilterFieldsForNonListScalar(field: Field): ReadonlyArray<QuickSearchFilterField> {
        if (field.isList || !field.type.isScalarType) {
            throw new Error(`Expected "${field.name}" to be a non-list scalar`);
        }

        const filterFields = QUICK_SEARCH_FILTER_FIELDS_BY_TYPE[field.type.graphQLScalarType.name] || [];
        const inputType = field.type.graphQLScalarType;
        let scalarFields: QuickSearchFilterField[] = [];
        if (field.isQuickSearchIndexed) {
            scalarFields = scalarFields.concat(filterFields
                .map(name => new QuickSearchScalarOrEnumFieldFilterField(field, QUICK_SEARCH_FILTER_OPERATORS[name], name === INPUT_FIELD_EQUAL ? undefined : name, inputType, undefined)));
        }

        if (field.language && field.isQuickSearchFulltextIndexed) {
            scalarFields = scalarFields.concat(
                STRING_TEXT_ANALYZER_FILTER_FIELDS.map(name => new QuickSearchScalarOrEnumFieldFilterField(field, this.getComplexFilterOperatorByName(name), name, inputType, field.language))
            );
        }
        return scalarFields;
    }

    private getComplexFilterOperatorByName(name: string): (fieldNode: QueryNode, valueNode: QueryNode, quickSearchLanguage?: QuickSearchLanguage, path?: ReadonlyArray<Field>) => QueryNode {
        switch (name) {
            case INPUT_FIELD_CONTAINS_ANY_WORD:
                return binaryOpWithLanguage(BinaryOperatorWithLanguage.QUICKSEARCH_CONTAINS_ANY_WORD);
            case INPUT_FIELD_NOT_CONTAINS_ANY_WORD:
                return binaryNotOpWithLanguage(BinaryOperatorWithLanguage.QUICKSEARCH_CONTAINS_ANY_WORD);
            case INPUT_FIELD_CONTAINS_ALL_WORDS:
                return (fieldNode: QueryNode, valueNode: QueryNode, quickSearchLanguage?: QuickSearchLanguage) => {
                    if (!quickSearchLanguage) {
                        return new RuntimeErrorQueryNode(noLanguageWasSuppliedError);
                    }
                    return this.generateComplexFilterOperator(BinaryOperatorWithLanguage.QUICKSEARCH_CONTAINS_ANY_WORD, BinaryOperator.AND, fieldNode, valueNode, quickSearchLanguage);
                };
            case INPUT_FIELD_NOT_CONTAINS_ALL_WORDS:
                return (fieldNode: QueryNode, valueNode: QueryNode, quickSearchLanguage?: QuickSearchLanguage) => {
                    if (!quickSearchLanguage) {
                        return new RuntimeErrorQueryNode(noLanguageWasSuppliedError);
                    }
                    return not(this.generateComplexFilterOperator(BinaryOperatorWithLanguage.QUICKSEARCH_CONTAINS_ANY_WORD, BinaryOperator.AND, fieldNode, valueNode, quickSearchLanguage));
                };
            case INPUT_FIELD_CONTAINS_ANY_PREFIX:
                return (fieldNode: QueryNode, valueNode: QueryNode, quickSearchLanguage?: QuickSearchLanguage) => {
                    if (!quickSearchLanguage) {
                        return new RuntimeErrorQueryNode(noLanguageWasSuppliedError);
                    }
                    return this.generateComplexFilterOperator(BinaryOperatorWithLanguage.QUICKSEARCH_CONTAINS_PREFIX, BinaryOperator.OR, fieldNode, valueNode, quickSearchLanguage);
                };
            case INPUT_FIELD_NOT_CONTAINS_ANY_PREFIX:
                return (fieldNode: QueryNode, valueNode: QueryNode, quickSearchLanguage?: QuickSearchLanguage) => {
                    if (!quickSearchLanguage) {
                        return new RuntimeErrorQueryNode(noLanguageWasSuppliedError);
                    }
                    return not(this.generateComplexFilterOperator(BinaryOperatorWithLanguage.QUICKSEARCH_CONTAINS_PREFIX, BinaryOperator.OR, fieldNode, valueNode, quickSearchLanguage));
                };
            case INPUT_FIELD_CONTAINS_ALL_PREFIXES:
                return (fieldNode: QueryNode, valueNode: QueryNode, quickSearchLanguage?: QuickSearchLanguage) => {
                    if (!quickSearchLanguage) {
                        return new RuntimeErrorQueryNode(noLanguageWasSuppliedError);
                    }
                    return this.generateComplexFilterOperator(BinaryOperatorWithLanguage.QUICKSEARCH_CONTAINS_PREFIX, BinaryOperator.AND, fieldNode, valueNode, quickSearchLanguage);
                };
            case INPUT_FIELD_NOT_CONTAINS_ALL_PREFIXES:
                return (fieldNode: QueryNode, valueNode: QueryNode, quickSearchLanguage?: QuickSearchLanguage) => {
                    if (!quickSearchLanguage) {
                        return new RuntimeErrorQueryNode(noLanguageWasSuppliedError);
                    }
                    return not(this.generateComplexFilterOperator(BinaryOperatorWithLanguage.QUICKSEARCH_CONTAINS_PREFIX, BinaryOperator.AND, fieldNode, valueNode, quickSearchLanguage));
                };
            case INPUT_FIELD_CONTAINS_PHRASE:
                return binaryOpWithLanguage(BinaryOperatorWithLanguage.QUICKSEARCH_CONTAINS_PHRASE);
            case INPUT_FIELD_NOT_CONTAINS_PHRASE:
                return binaryNotOpWithLanguage(BinaryOperatorWithLanguage.QUICKSEARCH_CONTAINS_PHRASE);
            default:
                throw new Error(`Complex Filter for '${name}' is not defined.`);
        }
    }

    private generateComplexFilterOperator(comparisonOperator: BinaryOperatorWithLanguage, logicalOperator: BinaryOperator, fieldNode: QueryNode, valueNode: QueryNode, quickSearchLanguage: QuickSearchLanguage): QueryNode {
        if (!(valueNode instanceof LiteralQueryNode) || (typeof valueNode.value !== 'string')) {
            throw new Error('QuickSearchComplexFilters requires a LiteralQueryNode with a string-value, as valueNode');
        }
        return new QuickSearchComplexOperatorQueryNode(valueNode.value, comparisonOperator, logicalOperator, fieldNode, quickSearchLanguage);
    }

    private generateFilterFieldsForEnumField(field: Field, graphQLEnumType: GraphQLEnumType): QuickSearchFilterField[] {
        if (field.isList || !field.type.isEnumType) {
            throw new Error(`Expected "${field.name}" to be a non-list enum`);
        }
        return ENUM_FILTER_FIELDS.map(name =>
            new QuickSearchScalarOrEnumFieldFilterField(
                field,
                FILTER_OPERATORS[name],
                name === INPUT_FIELD_EQUAL ? undefined : name, graphQLEnumType,
                field.isQuickSearchIndexed ? field.language : undefined));
    }

    @memorize()
    private generateListFieldFilterFields(field: Field, path?: ReadonlyArray<Field>): QuickSearchFilterField[] {
        const pathParam = path ? path : [];
        if (field.type instanceof ScalarType) {
            return this.buildScalarFilterFields(field.type, field, pathParam);
        } else if (field.type instanceof EnumType) {
            return this.buildEnumFilterFields(field.type, field, pathParam);
        } else {
            const inputType = this.generate(field.type, true);
            if (field.type.isEntityExtensionType) {
                return [new QuickSearchEntityExtensionFilterField(field, inputType)];
            } else {
                return [new QuickSearchNestedObjectFilterField(field, inputType)];
            }
        }
    }


    private buildScalarFilterFields(type: ScalarType, field: Field, path?: ReadonlyArray<Field>): QuickSearchScalarOrEnumFilterField[] {
        const filterFields = QUICK_SEARCH_FILTER_FIELDS_BY_TYPE[type.name] || [];

        let scalarFields: QuickSearchScalarOrEnumFilterField[] = [];
        if (field.isQuickSearchIndexed) {
            scalarFields = scalarFields.concat(filterFields.map(name => new QuickSearchScalarOrEnumFilterField(field, QUICK_SEARCH_FILTER_OPERATORS[name], name, type.graphQLScalarType)));
        }

        if (field.language && field.isQuickSearchFulltextIndexed) {
            scalarFields = scalarFields.concat(STRING_TEXT_ANALYZER_FILTER_FIELDS.map(name =>
                new QuickSearchScalarOrEnumFilterField(
                    field,
                    this.getComplexFilterOperatorByName(name),
                    name,
                    type.graphQLScalarType,
                    field.language)));
        }

        return scalarFields;

    }

    private buildEnumFilterFields(type: EnumType, field: Field, path?: ReadonlyArray<Field>) {
        return ENUM_FILTER_FIELDS.map(name => {
            return new QuickSearchScalarOrEnumFilterField(
                field,
                QUICK_SEARCH_FILTER_OPERATORS[name],
                name,
                this.enumTypeGenerator.generate(type));
        });
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