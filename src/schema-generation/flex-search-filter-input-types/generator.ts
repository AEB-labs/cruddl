import { GraphQLEnumType, Thunk } from 'graphql';
import memorize from 'memorize-decorator';
import { IDENTITY_ANALYZER, NORM_CI_ANALYZER } from '../../database/arangodb/schema-migration/arango-search-helpers';
import { FlexSearchLanguage } from '../../model/config';
import { EnumType, Field, ObjectType, ScalarType, Type } from '../../model/implementation';
import {
    BinaryOperationQueryNode,
    BinaryOperator,
    BinaryOperatorWithAnalyzer,
    ConstBoolQueryNode,
    LiteralQueryNode,
    NullQueryNode,
    QueryNode,
    RuntimeErrorQueryNode
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
    INPUT_FIELD_NOT_CONTAINS_PHRASE
} from '../../schema/constants';
import { getFlexSearchFilterTypeName } from '../../schema/names';
import { AnyValue, flatMap, objectEntries } from '../../utils/utils';
import { EnumTypeGenerator } from '../enum-type-generator';
import {
    ENUM_FILTER_FIELDS,
    FILTER_FIELDS_BY_TYPE,
    FILTER_OPERATORS,
    NUMERIC_FILTER_FIELDS
} from '../filter-input-types/constants';
import { QueryNodeResolveInfo, resolveThunk } from '../query-node-object-type';
import { TypedInputObjectType } from '../typed-input-object-type';
import {
    and,
    binaryNotOpWithLanguage,
    binaryOpWithLanguage,
    noLanguageWasSuppliedError,
    not
} from '../utils/input-types';
import {
    FLEX_SEARCH_FILTER_FIELDS_BY_TYPE,
    FLEX_SEARCH_FILTER_OPERATORS,
    STRING_FLEX_SEARCH_FILTER_OPERATORS,
    STRING_TEXT_ANALYZER_FILTER_FIELDS
} from './constants';
import {
    FlexSearchAndFilterField,
    FlexSearchEntityExtensionFilterField,
    FlexSearchFilterField,
    FlexSearchNestedObjectFilterField,
    FlexSearchOrFilterField,
    FlexSearchScalarOrEnumFieldFilterField,
    FlexSearchScalarOrEnumFilterField
} from './filter-fields';

export class FlexSearchFilterObjectType extends TypedInputObjectType<FlexSearchFilterField> {
    constructor(
        type: Type,
        fields: Thunk<ReadonlyArray<FlexSearchFilterField>>,
        public readonly isAggregration: boolean
    ) {
        super(
            getFlexSearchFilterTypeName(type.name, isAggregration),
            fields,
            `FlexSearchFilter type for \`${type.name}\`.\n\nAll fields in this type are *and*-combined; see the \`or\` field for *or*-combination.\n` +
                isAggregration
                ? `An aggregation contains all values of a list. Each check in this type is true if it matches any of the values in the list.`
                : `Large queries in conjunctive normal form (e.g. (a OR b) AND (c OR d)... ) and should be avoided.`
        );
    }

    getFilterNode(
        sourceNode: QueryNode,
        filterValue: AnyValue,
        path: ReadonlyArray<Field>,
        info: QueryNodeResolveInfo
    ): QueryNode {
        if (typeof filterValue !== 'object' || filterValue === null) {
            return new BinaryOperationQueryNode(sourceNode, BinaryOperator.EQUAL, NullQueryNode.NULL);
        }
        const filterNodes = objectEntries(filterValue as any).map(([name, value]) =>
            this.getFieldOrThrow(name).getFilterNode(sourceNode, value, path, info)
        );
        return filterNodes.reduce(and, ConstBoolQueryNode.TRUE);
    }
}

export class FlexSearchFilterTypeGenerator {
    constructor(private enumTypeGenerator: EnumTypeGenerator) {}

    @memorize()
    generate(type: ObjectType, isAggregation: boolean): FlexSearchFilterObjectType {
        const flexSearchFilterObjectType = this.generateFlexSearchFilterType(
            type,
            () => {
                return flatMap(
                    type.fields.filter(value => value.isFlexSearchIndexed || value.isFlexSearchFulltextIndexed),
                    (field: Field) => this.generateFieldFlexSearchFilterFields(field, isAggregation)
                );
            },
            isAggregation
        );
        return flexSearchFilterObjectType;
    }

    private generateFlexSearchFilterType(
        type: Type,
        fields: Thunk<ReadonlyArray<FlexSearchFilterField>>,
        isAggregation: boolean
    ): FlexSearchFilterObjectType {
        function getFields(): ReadonlyArray<FlexSearchFilterField> {
            const filterFields = [...resolveThunk(fields)];
            if (!isAggregation) {
                return filterFields.concat([
                    new FlexSearchAndFilterField(filterType),
                    new FlexSearchOrFilterField(filterType)
                ]);
            } else {
                return filterFields;
            }
        }

        const filterType = new FlexSearchFilterObjectType(type, getFields, isAggregation);
        return filterType;
    }

    public generateFieldFlexSearchFilterFields(
        field: Field,
        isAggregation: boolean
    ): ReadonlyArray<FlexSearchFilterField> {
        if (field.isList) {
            return this.generateListFieldFilterFields(field);
        }
        if (field.type.isScalarType) {
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
            return this.generateFilterFieldsForEnumField(field, graphQLEnumType);
        }
        return [];
    }

    private generateFilterFieldsForNonListScalar(field: Field): ReadonlyArray<FlexSearchFilterField> {
        if (field.isList || !field.type.isScalarType) {
            throw new Error(`Expected "${field.name}" to be a non-list scalar`);
        }

        const filterFields = this.getFilterFieldsByType(field.type);
        const inputType = field.type.graphQLScalarType;
        let scalarFields: FlexSearchFilterField[] = [];
        if (field.isFlexSearchIndexed) {
            scalarFields = scalarFields.concat(
                filterFields.map(
                    name =>
                        new FlexSearchScalarOrEnumFieldFilterField(
                            field,
                            inputType.name === 'String'
                                ? STRING_FLEX_SEARCH_FILTER_OPERATORS[name]
                                : FLEX_SEARCH_FILTER_OPERATORS[name],
                            name === INPUT_FIELD_EQUAL ? undefined : name,
                            inputType,
                            undefined
                        )
                )
            );
        }

        if (field.flexSearchLanguage && field.isFlexSearchFulltextIndexed) {
            scalarFields = scalarFields.concat(
                STRING_TEXT_ANALYZER_FILTER_FIELDS.map(
                    name =>
                        new FlexSearchScalarOrEnumFieldFilterField(
                            field,
                            this.getComplexFilterOperatorByName(name),
                            name,
                            inputType,
                            field.flexSearchLanguage,
                            `text_${field.flexSearchLanguage}`
                        )
                )
            );
        }
        return scalarFields;
    }

    private getComplexFilterOperatorByName(
        name: string
    ): (
        fieldNode: QueryNode,
        valueNode: QueryNode,
        flexSearchLanguage?: FlexSearchLanguage,
        analyzer?: string,
        path?: ReadonlyArray<Field>
    ) => QueryNode {
        switch (name) {
            case INPUT_FIELD_CONTAINS_ANY_WORD:
                return binaryOpWithLanguage(BinaryOperatorWithAnalyzer.FLEX_SEARCH_CONTAINS_ANY_WORD);
            case INPUT_FIELD_NOT_CONTAINS_ANY_WORD:
                return binaryNotOpWithLanguage(BinaryOperatorWithAnalyzer.FLEX_SEARCH_CONTAINS_ANY_WORD);
            case INPUT_FIELD_CONTAINS_ALL_WORDS:
                return (fieldNode: QueryNode, valueNode: QueryNode, flexSearchLanguage?: FlexSearchLanguage) => {
                    if (!flexSearchLanguage) {
                        return new RuntimeErrorQueryNode(noLanguageWasSuppliedError);
                    }
                    return this.generateComplexFilterOperator(
                        BinaryOperatorWithAnalyzer.FLEX_SEARCH_CONTAINS_ANY_WORD,
                        BinaryOperator.AND,
                        fieldNode,
                        valueNode,
                        flexSearchLanguage
                    );
                };
            case INPUT_FIELD_NOT_CONTAINS_ALL_WORDS:
                return (fieldNode: QueryNode, valueNode: QueryNode, flexSearchLanguage?: FlexSearchLanguage) => {
                    if (!flexSearchLanguage) {
                        return new RuntimeErrorQueryNode(noLanguageWasSuppliedError);
                    }
                    return not(
                        this.generateComplexFilterOperator(
                            BinaryOperatorWithAnalyzer.FLEX_SEARCH_CONTAINS_ANY_WORD,
                            BinaryOperator.AND,
                            fieldNode,
                            valueNode,
                            flexSearchLanguage
                        )
                    );
                };
            case INPUT_FIELD_CONTAINS_ANY_PREFIX:
                return (fieldNode: QueryNode, valueNode: QueryNode, flexSearchLanguage?: FlexSearchLanguage) => {
                    if (!flexSearchLanguage) {
                        return new RuntimeErrorQueryNode(noLanguageWasSuppliedError);
                    }
                    return this.generateComplexFilterOperator(
                        BinaryOperatorWithAnalyzer.FLEX_SEARCH_CONTAINS_PREFIX,
                        BinaryOperator.OR,
                        fieldNode,
                        valueNode,
                        flexSearchLanguage
                    );
                };
            case INPUT_FIELD_NOT_CONTAINS_ANY_PREFIX:
                return (fieldNode: QueryNode, valueNode: QueryNode, flexSearchLanguage?: FlexSearchLanguage) => {
                    if (!flexSearchLanguage) {
                        return new RuntimeErrorQueryNode(noLanguageWasSuppliedError);
                    }
                    return not(
                        this.generateComplexFilterOperator(
                            BinaryOperatorWithAnalyzer.FLEX_SEARCH_CONTAINS_PREFIX,
                            BinaryOperator.OR,
                            fieldNode,
                            valueNode,
                            flexSearchLanguage
                        )
                    );
                };
            case INPUT_FIELD_CONTAINS_ALL_PREFIXES:
                return (fieldNode: QueryNode, valueNode: QueryNode, flexSearchLanguage?: FlexSearchLanguage) => {
                    if (!flexSearchLanguage) {
                        return new RuntimeErrorQueryNode(noLanguageWasSuppliedError);
                    }
                    return this.generateComplexFilterOperator(
                        BinaryOperatorWithAnalyzer.FLEX_SEARCH_CONTAINS_PREFIX,
                        BinaryOperator.AND,
                        fieldNode,
                        valueNode,
                        flexSearchLanguage
                    );
                };
            case INPUT_FIELD_NOT_CONTAINS_ALL_PREFIXES:
                return (fieldNode: QueryNode, valueNode: QueryNode, flexSearchLanguage?: FlexSearchLanguage) => {
                    if (!flexSearchLanguage) {
                        return new RuntimeErrorQueryNode(noLanguageWasSuppliedError);
                    }
                    return not(
                        this.generateComplexFilterOperator(
                            BinaryOperatorWithAnalyzer.FLEX_SEARCH_CONTAINS_PREFIX,
                            BinaryOperator.AND,
                            fieldNode,
                            valueNode,
                            flexSearchLanguage
                        )
                    );
                };
            case INPUT_FIELD_CONTAINS_PHRASE:
                return binaryOpWithLanguage(BinaryOperatorWithAnalyzer.FLEX_SEARCH_CONTAINS_PHRASE);
            case INPUT_FIELD_NOT_CONTAINS_PHRASE:
                return binaryNotOpWithLanguage(BinaryOperatorWithAnalyzer.FLEX_SEARCH_CONTAINS_PHRASE);
            default:
                throw new Error(`Complex Filter for '${name}' is not defined.`);
        }
    }

    private generateComplexFilterOperator(
        comparisonOperator: BinaryOperatorWithAnalyzer,
        logicalOperator: BinaryOperator,
        fieldNode: QueryNode,
        valueNode: QueryNode,
        flexSearchLanguage: FlexSearchLanguage
    ): QueryNode {
        if (!(valueNode instanceof LiteralQueryNode) || typeof valueNode.value !== 'string') {
            throw new Error('FlexSearchComplexFilters requires a LiteralQueryNode with a string-value, as valueNode');
        }
        return new FlexSearchComplexOperatorQueryNode(
            valueNode.value,
            comparisonOperator,
            logicalOperator,
            fieldNode,
            flexSearchLanguage
        );
    }

    private generateFilterFieldsForEnumField(field: Field, graphQLEnumType: GraphQLEnumType): FlexSearchFilterField[] {
        if (field.isList || !field.type.isEnumType) {
            throw new Error(`Expected "${field.name}" to be a non-list enum`);
        }
        return ENUM_FILTER_FIELDS.map(
            name =>
                new FlexSearchScalarOrEnumFieldFilterField(
                    field,
                    FILTER_OPERATORS[name],
                    name === INPUT_FIELD_EQUAL ? undefined : name,
                    graphQLEnumType,
                    field.isFlexSearchIndexed ? field.flexSearchLanguage : undefined,
                    field.isFlexSearchIndexed
                        ? field.flexSearchLanguage
                        : field.isFlexSearchIndexCaseSensitive
                        ? IDENTITY_ANALYZER
                        : NORM_CI_ANALYZER
                )
        );
    }

    @memorize()
    private generateListFieldFilterFields(field: Field, path?: ReadonlyArray<Field>): FlexSearchFilterField[] {
        const pathParam = path ? path : [];
        if (field.type instanceof ScalarType) {
            return this.buildScalarFilterFields(field.type, field, pathParam);
        } else if (field.type instanceof EnumType) {
            return this.buildEnumFilterFields(field.type, field, pathParam);
        } else {
            const inputType = this.generate(field.type, true);
            if (field.type.isEntityExtensionType) {
                return [new FlexSearchEntityExtensionFilterField(field, inputType)];
            } else {
                return [new FlexSearchNestedObjectFilterField(field, inputType)];
            }
        }
    }

    private buildScalarFilterFields(
        type: ScalarType,
        field: Field,
        path?: ReadonlyArray<Field>
    ): FlexSearchScalarOrEnumFilterField[] {
        const filterFields = this.getFilterFieldsByType(type);

        let scalarFields: FlexSearchScalarOrEnumFilterField[] = [];
        if (field.isFlexSearchIndexed) {
            scalarFields = scalarFields.concat(
                filterFields.map(
                    name =>
                        new FlexSearchScalarOrEnumFilterField(
                            field,
                            FLEX_SEARCH_FILTER_OPERATORS[name],
                            name,
                            type.graphQLScalarType,
                            undefined,
                            field.isFlexSearchIndexCaseSensitive ? IDENTITY_ANALYZER : NORM_CI_ANALYZER
                        )
                )
            );
        }

        if (field.flexSearchLanguage && field.isFlexSearchFulltextIndexed) {
            scalarFields = scalarFields.concat(
                STRING_TEXT_ANALYZER_FILTER_FIELDS.map(
                    name =>
                        new FlexSearchScalarOrEnumFilterField(
                            field,
                            this.getComplexFilterOperatorByName(name),
                            name,
                            type.graphQLScalarType,
                            field.flexSearchLanguage
                        )
                )
            );
        }

        return scalarFields;
    }

    private buildEnumFilterFields(type: EnumType, field: Field, path?: ReadonlyArray<Field>) {
        return ENUM_FILTER_FIELDS.map(name => {
            return new FlexSearchScalarOrEnumFilterField(
                field,
                FLEX_SEARCH_FILTER_OPERATORS[name],
                name,
                this.enumTypeGenerator.generate(type)
            );
        });
    }

    private getFilterFieldsByType(type: Type) {
        if (type.isScalarType && type.isNumberType) {
            return NUMERIC_FILTER_FIELDS;
        }
        return FLEX_SEARCH_FILTER_FIELDS_BY_TYPE[type.name] || [];
    }
}
