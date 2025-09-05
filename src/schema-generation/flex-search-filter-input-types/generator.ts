import { GraphQLEnumType, GraphQLString, resolveReadonlyArrayThunk } from 'graphql';
import { ThunkReadonlyArray } from 'graphql/type/definition';
import memorize from 'memorize-decorator';
import { EnumType, Field, ObjectType, ScalarType, Type } from '../../model';
import {
    BinaryOperator,
    BinaryOperatorWithAnalyzer,
    LiteralQueryNode,
    QueryNode,
    RuntimeErrorQueryNode,
} from '../../query-tree';
import { FlexSearchComplexOperatorQueryNode } from '../../query-tree/flex-search';
import {
    INPUT_FIELD_CONTAINS_ALL_PREFIXES,
    INPUT_FIELD_CONTAINS_ALL_WORDS,
    INPUT_FIELD_CONTAINS_ANY_PREFIX,
    INPUT_FIELD_CONTAINS_ANY_WORD,
    INPUT_FIELD_CONTAINS_PHRASE,
    INPUT_FIELD_EQUAL,
    INPUT_FIELD_NOT_CONTAINS_ALL_PREFIXES,
    INPUT_FIELD_NOT_CONTAINS_ALL_WORDS,
    INPUT_FIELD_NOT_CONTAINS_ANY_PREFIX,
    INPUT_FIELD_NOT_CONTAINS_ANY_WORD,
    INPUT_FIELD_NOT_CONTAINS_PHRASE,
} from '../../schema/constants';
import { getFlexSearchFilterTypeName } from '../../schema/names';
import { GraphQLI18nString } from '../../schema/scalars/string-map';
import { flatMap } from '../../utils/utils';
import { EnumTypeGenerator } from '../enum-type-generator';
import {
    ENUM_FILTER_FIELDS,
    FILTER_OPERATORS,
    NUMERIC_FILTER_FIELDS,
} from '../filter-input-types/constants';
import {
    binaryNotOpWithAnalyzer,
    binaryOpWithAnalyzer,
    noAnalyzerWasSuppliedError,
    not,
} from '../utils/input-types';
import {
    FLEX_SEARCH_FILTER_FIELDS_BY_TYPE,
    FLEX_SEARCH_FILTER_OPERATORS,
    STRING_FLEX_SEARCH_FILTER_FIELDS,
    STRING_FLEX_SEARCH_FILTER_OPERATORS,
    STRING_TEXT_ANALYZER_FILTER_FIELDS,
} from './constants';
import {
    FlexSearchAndFilterField,
    FlexSearchEmptyListFilterField,
    FlexSearchEntityExtensionFilterField,
    FlexSearchFilterField,
    FlexSearchI18nStringLocalizedFilterField,
    FlexSearchNestedObjectFilterField,
    FlexSearchOrFilterField,
    FlexSearchScalarOrEnumFieldFilterField,
    FlexSearchScalarOrEnumFilterField,
    I18nStringLocalizedFilterLanguageField,
} from './filter-fields';
import { FlexSearchFilterObjectType } from './filter-types';

export class FlexSearchFilterTypeGenerator {
    constructor(private enumTypeGenerator: EnumTypeGenerator) {}

    @memorize()
    generate(type: ObjectType, isAggregation: boolean): FlexSearchFilterObjectType {
        const flexSearchFilterObjectType = this.generateFlexSearchFilterType(
            type,
            () => {
                return flatMap(
                    type.fields.filter(
                        (value) => value.isFlexSearchIndexed || value.isFlexSearchFulltextIndexed,
                    ),
                    (field: Field) =>
                        this.generateFieldFlexSearchFilterFields(field, isAggregation),
                );
            },
            isAggregation,
        );
        return flexSearchFilterObjectType;
    }

    private generateFlexSearchFilterType(
        type: Type,
        fields: ThunkReadonlyArray<FlexSearchFilterField>,
        isAggregation: boolean,
    ): FlexSearchFilterObjectType {
        function getFields(): ReadonlyArray<FlexSearchFilterField> {
            const filterFields = [...resolveReadonlyArrayThunk(fields)];
            if (!isAggregation) {
                return filterFields.concat([
                    new FlexSearchAndFilterField(filterType),
                    new FlexSearchOrFilterField(filterType),
                ]);
            } else {
                return filterFields;
            }
        }

        const filterType = new FlexSearchFilterObjectType(
            getFlexSearchFilterTypeName(type.name, isAggregation),
            getFields,
            `FlexSearchFilter type for \`${type.name}\`.\n\nAll fields in this type are *and*-combined; see the \`or\` field for *or*-combination.\n` +
            isAggregation
                ? `An aggregation contains all values of a list. Each check in this type is true if it matches any of the values in the list.`
                : `Large queries in conjunctive normal form (e.g. (a OR b) AND (c OR d)... ) and should be avoided.`,
        );
        return filterType;
    }

    public generateFieldFlexSearchFilterFields(
        field: Field,
        isAggregation: boolean,
    ): ReadonlyArray<FlexSearchFilterField> {
        if (field.isList) {
            const fields = this.generateTypeSpecificListFieldFilterFields(field);
            return [...fields, new FlexSearchEmptyListFilterField(field)];
        }
        if (field.type.isScalarType) {
            if (field.type.name === GraphQLI18nString.name) {
                return this.generateFilterFieldsForI18nString(field);
            }
            return this.generateFilterFieldsForNonListScalar(field);
        }
        if (field.type.isObjectType) {
            const inputType = this.generate(field.type, isAggregation);
            if (field.type.isEntityExtensionType) {
                return [new FlexSearchEntityExtensionFilterField(field, inputType)];
            } else {
                return [new FlexSearchNestedObjectFilterField(field, inputType)];
            }
        }
        if (field.type.isEnumType) {
            const graphQLEnumType = this.enumTypeGenerator.generate(field.type);
            return this.generateFilterFieldsForNonListEnumField(field, graphQLEnumType);
        }
        return [];
    }

    private generateFilterFieldsForNonListScalar(
        field: Field,
    ): ReadonlyArray<FlexSearchFilterField> {
        if (field.isList || !field.type.isScalarType) {
            throw new Error(`Expected "${field.name}" to be a non-list scalar`);
        }

        const filterFields = this.getFilterFieldsByType(field.type);
        const inputType = field.type.graphQLScalarType;
        let scalarFields: FlexSearchFilterField[] = [];
        if (field.isFlexSearchIndexed) {
            scalarFields = scalarFields.concat(
                filterFields.map(
                    (name) =>
                        new FlexSearchScalarOrEnumFieldFilterField(
                            field,
                            inputType.name === 'String'
                                ? STRING_FLEX_SEARCH_FILTER_OPERATORS[name]
                                : FLEX_SEARCH_FILTER_OPERATORS[name],
                            name === INPUT_FIELD_EQUAL ? undefined : name,
                            inputType,
                            field.flexSearchAnalyzer,
                        ),
                ),
            );
        }

        if (field.flexSearchLanguage && field.isFlexSearchFulltextIndexed) {
            scalarFields = scalarFields.concat(
                STRING_TEXT_ANALYZER_FILTER_FIELDS.map(
                    (name) =>
                        new FlexSearchScalarOrEnumFieldFilterField(
                            field,
                            this.getComplexFilterOperatorByName(name),
                            name,
                            inputType,
                            field.getFlexSearchFulltextAnalyzerOrThrow(),
                        ),
                ),
            );
        }
        return scalarFields;
    }

    private getComplexFilterOperatorByName(
        name: string,
    ): (
        fieldNode: QueryNode,
        valueNode: QueryNode,
        analyzer?: string,
        path?: ReadonlyArray<Field>,
    ) => QueryNode {
        switch (name) {
            case INPUT_FIELD_CONTAINS_ANY_WORD:
                return binaryOpWithAnalyzer(
                    BinaryOperatorWithAnalyzer.FLEX_SEARCH_CONTAINS_ANY_WORD,
                );
            case INPUT_FIELD_NOT_CONTAINS_ANY_WORD:
                return binaryNotOpWithAnalyzer(
                    BinaryOperatorWithAnalyzer.FLEX_SEARCH_CONTAINS_ANY_WORD,
                );
            case INPUT_FIELD_CONTAINS_ALL_WORDS:
                return (fieldNode: QueryNode, valueNode: QueryNode, analyzer?: string) => {
                    if (!analyzer) {
                        return new RuntimeErrorQueryNode(noAnalyzerWasSuppliedError);
                    }
                    return this.generateComplexFilterOperator(
                        BinaryOperatorWithAnalyzer.FLEX_SEARCH_CONTAINS_ANY_WORD,
                        BinaryOperator.AND,
                        fieldNode,
                        valueNode,
                        analyzer,
                    );
                };
            case INPUT_FIELD_NOT_CONTAINS_ALL_WORDS:
                return (fieldNode: QueryNode, valueNode: QueryNode, analyzer?: string) => {
                    if (!analyzer) {
                        return new RuntimeErrorQueryNode(noAnalyzerWasSuppliedError);
                    }
                    return not(
                        this.generateComplexFilterOperator(
                            BinaryOperatorWithAnalyzer.FLEX_SEARCH_CONTAINS_ANY_WORD,
                            BinaryOperator.AND,
                            fieldNode,
                            valueNode,
                            analyzer,
                        ),
                    );
                };
            case INPUT_FIELD_CONTAINS_ANY_PREFIX:
                return (fieldNode: QueryNode, valueNode: QueryNode, analyzer?: string) => {
                    if (!analyzer) {
                        return new RuntimeErrorQueryNode(noAnalyzerWasSuppliedError);
                    }
                    return this.generateComplexFilterOperator(
                        BinaryOperatorWithAnalyzer.FLEX_SEARCH_CONTAINS_PREFIX,
                        BinaryOperator.OR,
                        fieldNode,
                        valueNode,
                        analyzer,
                    );
                };
            case INPUT_FIELD_NOT_CONTAINS_ANY_PREFIX:
                return (fieldNode: QueryNode, valueNode: QueryNode, analyzer?: string) => {
                    if (!analyzer) {
                        return new RuntimeErrorQueryNode(noAnalyzerWasSuppliedError);
                    }
                    return not(
                        this.generateComplexFilterOperator(
                            BinaryOperatorWithAnalyzer.FLEX_SEARCH_CONTAINS_PREFIX,
                            BinaryOperator.OR,
                            fieldNode,
                            valueNode,
                            analyzer,
                        ),
                    );
                };
            case INPUT_FIELD_CONTAINS_ALL_PREFIXES:
                return (fieldNode: QueryNode, valueNode: QueryNode, analyzer?: string) => {
                    if (!analyzer) {
                        return new RuntimeErrorQueryNode(noAnalyzerWasSuppliedError);
                    }
                    return this.generateComplexFilterOperator(
                        BinaryOperatorWithAnalyzer.FLEX_SEARCH_CONTAINS_PREFIX,
                        BinaryOperator.AND,
                        fieldNode,
                        valueNode,
                        analyzer,
                    );
                };
            case INPUT_FIELD_NOT_CONTAINS_ALL_PREFIXES:
                return (fieldNode: QueryNode, valueNode: QueryNode, analyzer?: string) => {
                    if (!analyzer) {
                        return new RuntimeErrorQueryNode(noAnalyzerWasSuppliedError);
                    }
                    return not(
                        this.generateComplexFilterOperator(
                            BinaryOperatorWithAnalyzer.FLEX_SEARCH_CONTAINS_PREFIX,
                            BinaryOperator.AND,
                            fieldNode,
                            valueNode,
                            analyzer,
                        ),
                    );
                };
            case INPUT_FIELD_CONTAINS_PHRASE:
                return binaryOpWithAnalyzer(BinaryOperatorWithAnalyzer.FLEX_SEARCH_CONTAINS_PHRASE);
            case INPUT_FIELD_NOT_CONTAINS_PHRASE:
                return binaryNotOpWithAnalyzer(
                    BinaryOperatorWithAnalyzer.FLEX_SEARCH_CONTAINS_PHRASE,
                );
            default:
                throw new Error(`Complex Filter for '${name}' is not defined.`);
        }
    }

    private generateComplexFilterOperator(
        comparisonOperator: BinaryOperatorWithAnalyzer,
        logicalOperator: BinaryOperator,
        fieldNode: QueryNode,
        valueNode: QueryNode,
        analyzer: string,
    ): QueryNode {
        if (!(valueNode instanceof LiteralQueryNode) || typeof valueNode.value !== 'string') {
            throw new Error(
                'FlexSearchComplexFilters requires a LiteralQueryNode with a string-value, as valueNode',
            );
        }
        return new FlexSearchComplexOperatorQueryNode(
            valueNode.value,
            comparisonOperator,
            logicalOperator,
            fieldNode,
            analyzer,
            true,
        );
    }

    private generateFilterFieldsForNonListEnumField(
        field: Field,
        graphQLEnumType: GraphQLEnumType,
    ): ReadonlyArray<FlexSearchFilterField> {
        if (field.isList || !field.type.isEnumType) {
            throw new Error(`Expected "${field.name}" to be a non-list enum`);
        }
        return ENUM_FILTER_FIELDS.map(
            (name) =>
                new FlexSearchScalarOrEnumFieldFilterField(
                    field,
                    FILTER_OPERATORS[name],
                    name === INPUT_FIELD_EQUAL ? undefined : name,
                    graphQLEnumType,
                    field.flexSearchAnalyzer,
                ),
        );
    }

    @memorize()
    private generateTypeSpecificListFieldFilterFields(
        field: Field,
        path?: ReadonlyArray<Field>,
    ): ReadonlyArray<FlexSearchFilterField> {
        const pathParam = path ? path : [];
        if (field.type instanceof ScalarType) {
            return this.buildFilterFieldsForListScalar(field.type, field, pathParam);
        } else if (field.type instanceof EnumType) {
            return this.buildFilterFieldsForListEnum(field.type, field, pathParam);
        } else {
            const inputType = this.generate(field.type, true);
            if (field.type.isEntityExtensionType) {
                return [new FlexSearchEntityExtensionFilterField(field, inputType)];
            } else {
                return [new FlexSearchNestedObjectFilterField(field, inputType)];
            }
        }
    }

    private buildFilterFieldsForListScalar(
        type: ScalarType,
        field: Field,
        path?: ReadonlyArray<Field>,
    ): ReadonlyArray<FlexSearchScalarOrEnumFieldFilterField> {
        const filterFields = this.getFilterFieldsByType(type);

        let scalarFields: FlexSearchScalarOrEnumFieldFilterField[] = [];
        if (field.isFlexSearchIndexed) {
            scalarFields = scalarFields.concat(
                filterFields.map(
                    (name) =>
                        new FlexSearchScalarOrEnumFieldFilterField(
                            field,
                            type.name === 'String'
                                ? STRING_FLEX_SEARCH_FILTER_OPERATORS[name]
                                : FLEX_SEARCH_FILTER_OPERATORS[name],
                            name,
                            type.graphQLScalarType,
                            field.flexSearchAnalyzer,
                            true,
                        ),
                ),
            );
        }

        if (field.flexSearchLanguage && field.isFlexSearchFulltextIndexed) {
            scalarFields = scalarFields.concat(
                STRING_TEXT_ANALYZER_FILTER_FIELDS.map(
                    (name) =>
                        new FlexSearchScalarOrEnumFieldFilterField(
                            field,
                            this.getComplexFilterOperatorByName(name),
                            name,
                            type.graphQLScalarType,
                            field.flexSearchFulltextAnalyzer,
                        ),
                ),
            );
        }

        return scalarFields;
    }

    private buildFilterFieldsForListEnum(
        type: EnumType,
        field: Field,
        path?: ReadonlyArray<Field>,
    ) {
        return ENUM_FILTER_FIELDS.map((name) => {
            return new FlexSearchScalarOrEnumFieldFilterField(
                field,
                FLEX_SEARCH_FILTER_OPERATORS[name],
                name,
                this.enumTypeGenerator.generate(type),
                undefined,
                true,
            );
        });
    }

    private getFilterFieldsByType(type: Type): ReadonlyArray<string> {
        if (type.isScalarType && type.isNumberType) {
            return NUMERIC_FILTER_FIELDS;
        }
        return FLEX_SEARCH_FILTER_FIELDS_BY_TYPE[type.name] || [];
    }

    private generateFilterFieldsForI18nString(field: Field) {
        return [
            new FlexSearchI18nStringLocalizedFilterField(
                field,
                this.generateI18nStringLocalizedFilterObjectType(
                    field.isFlexSearchIndexed,
                    field.isFlexSearchFulltextIndexed,
                ),
            ),
        ];
    }

    @memorize()
    private generateI18nStringLocalizedFilterObjectType(
        withIdentityIndex: boolean,
        withFullTextIndex: boolean,
    ): FlexSearchFilterObjectType {
        const fields: FlexSearchFilterField[] = [new I18nStringLocalizedFilterLanguageField()];
        if (withIdentityIndex) {
            fields.push(
                ...STRING_FLEX_SEARCH_FILTER_FIELDS.map(
                    (operatorName) =>
                        new FlexSearchScalarOrEnumFilterField(
                            STRING_FLEX_SEARCH_FILTER_OPERATORS[operatorName],
                            operatorName,
                            GraphQLString,
                            false,
                        ),
                ),
            );
        }
        if (withFullTextIndex) {
            fields.push(
                ...STRING_TEXT_ANALYZER_FILTER_FIELDS.map(
                    (operatorName) =>
                        new FlexSearchScalarOrEnumFilterField(
                            this.getComplexFilterOperatorByName(operatorName),
                            operatorName,
                            GraphQLString,
                            true,
                        ),
                ),
            );
        }

        let namePart: string;
        if (withIdentityIndex) {
            if (withFullTextIndex) {
                namePart = 'RegularAndFulltext';
            } else {
                namePart = 'Regular';
            }
        } else if (withFullTextIndex) {
            namePart = 'Fulltext';
        } else {
            throw new Error(`Can't both omit identity and fulltext filter fields`);
        }

        return new FlexSearchFilterObjectType(
            `I18nStringLocalized${namePart}Filter`,
            fields,
            `Allows to on a specific localization of an \`I18nString\`\n\n` +
                `The language should be provided in the special \`language\` field. All other fields are *and*-combined. There are no fallback rules for string localization; if there is no localization for the given language, the filter acts as if the field was \`null\`.`,
        );
    }
}
