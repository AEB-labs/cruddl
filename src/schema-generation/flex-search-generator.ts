import { GraphQLFieldConfigArgumentMap, GraphQLString } from 'graphql';
import { Field, RootEntityType } from '../model/implementation';
import { BinaryOperationQueryNode, BinaryOperator, BinaryOperatorWithLanguage, ConditionalQueryNode, ConstBoolQueryNode, CountQueryNode, FieldPathQueryNode, FLEX_SEARCH_TOO_MANY_OBJECTS, LiteralQueryNode, OperatorWithLanguageQueryNode, PreExecQueryParms, QueryNode, RuntimeErrorQueryNode, VariableQueryNode, WithPreExecutionQueryNode } from '../query-tree';
import { FlexSearchQueryNode, FlexSearchStartsWithQueryNode } from '../query-tree/flex-search';
import { simplifyBooleans } from '../query-tree/utils';
import { FILTER_ARG, FLEX_SEARCH_EXPRESSION_ARG, FLEX_SEARCH_FILTER_ARG, ORDER_BY_ARG } from '../schema/constants';
import { getFlexSearchEntitiesFieldName, getMetaFieldName } from '../schema/names';
import { decapitalize } from '../utils/utils';
import { FilterAugmentation } from './filter-augmentation';
import { FlexSearchFilterObjectType, FlexSearchFilterTypeGenerator } from './flex-search-filter-input-types/generator';
import { ListAugmentation } from './list-augmentation';
import { OutputTypeGenerator } from './output-type-generator';
import { QueryNodeField, QueryNodeListType, QueryNodeNonNullType, QueryNodeObjectType, QueryNodeResolveInfo } from './query-node-object-type';
import { or } from './utils/input-types';


export const DEFAULT_ARANGOSEARCH_MAX_FILTERABLE_AMOUNT: number = 1000;
export const TOO_MANY_OBJECTS_ERROR = 'Too many objects.';

/**
 * Augments list fields with filter and pagination features
 */
export class FlexSearchGenerator {


    constructor(
        private readonly flexSearchTypeGenerator: FlexSearchFilterTypeGenerator,
        private readonly outputTypeGenerator: OutputTypeGenerator,
        private readonly listAugmentation: ListAugmentation,
        private readonly filterAugmentation: FilterAugmentation
    ) {

    }

    generate(rootEntityType: RootEntityType): QueryNodeField {
        const fieldConfig = ({
            name: getFlexSearchEntitiesFieldName(rootEntityType.name),
            type: new QueryNodeListType(new QueryNodeNonNullType(this.outputTypeGenerator.generate(rootEntityType))),
            description: `Queries for ${rootEntityType.pluralName} using FlexSearch.`,
            resolve: () => new FlexSearchQueryNode({ rootEntityType: rootEntityType })
        });
        return this.augmentWithCondition(this.listAugmentation.augment(this.generateFromConfig(fieldConfig, rootEntityType), rootEntityType), rootEntityType);
    }

    generateMeta(rootEntityType: RootEntityType, metaType: QueryNodeObjectType): QueryNodeField {
        const fieldConfig: QueryNodeField = ({
            name: getMetaFieldName(getFlexSearchEntitiesFieldName(rootEntityType.name)),
            type: new QueryNodeNonNullType(metaType),
            description: `Queries for ${rootEntityType.pluralName} using FlexSearch.`,
            // meta fields should never be null. Also, this is crucial for performance. Without it, we would introduce
            // an unnecessary variable with the collection contents (which is slow) and we would to an equality check of
            // a collection against NULL which is deadly (v8 evaluation)
            skipNullCheck: true,
            resolve: () => {
                return new FlexSearchQueryNode({ rootEntityType: rootEntityType }
                );
            }
        });
        return this.filterAugmentation.augment(this.generateFromConfig(fieldConfig, rootEntityType), rootEntityType);
    }

    generateFromConfig(schemaField: QueryNodeField, rootEntityType: RootEntityType): QueryNodeField {
        if (!rootEntityType.isObjectType) {
            return schemaField;
        }
        const flexSearchType = this.flexSearchTypeGenerator.generate(rootEntityType, false);
        // Don't include searchExpression if there are no fields that are included in the search
        const newArgs: GraphQLFieldConfigArgumentMap = rootEntityType.hasIncludedInSearchFields ?
            {
                [FLEX_SEARCH_FILTER_ARG]: { type: flexSearchType.getInputType() },
                [FLEX_SEARCH_EXPRESSION_ARG]: { type: GraphQLString }
            }
            :
            {
                [FLEX_SEARCH_FILTER_ARG]: { type: flexSearchType.getInputType() }
            };


        return {
            ...schemaField,
            args: {
                ...schemaField.args,
                ...newArgs
            },
            resolve: (sourceNode, args, info) => {
                const itemVariable = new VariableQueryNode(decapitalize(rootEntityType.name));
                const flexFilterNode = this.buildFlexSearchFilterNode(args, flexSearchType, itemVariable, rootEntityType, info);
                return new FlexSearchQueryNode({
                    rootEntityType: rootEntityType,
                    flexFilterNode: flexFilterNode,
                    itemVariable: itemVariable
                });
            }


        };


    };

    private buildFlexSearchFilterNode(args: { [p: string]: any }, filterType: FlexSearchFilterObjectType, itemVariable: VariableQueryNode, rootEntityType: RootEntityType, info: QueryNodeResolveInfo) {
        const filterValue = args[FLEX_SEARCH_FILTER_ARG] || {};
        const expression = rootEntityType.hasIncludedInSearchFields ? args[FLEX_SEARCH_EXPRESSION_ARG] as string : undefined;
        const filterNode = simplifyBooleans(filterType.getFilterNode(itemVariable, filterValue, [], info));
        const searchFilterNode = simplifyBooleans(this.buildFlexSearchSearchFilterNode(rootEntityType, itemVariable, expression));
        if (searchFilterNode === ConstBoolQueryNode.TRUE) {
            return filterNode;
        } else {
            return simplifyBooleans(new BinaryOperationQueryNode(filterNode, BinaryOperator.AND, searchFilterNode));
        }

    }

    private getPreExecQueryNode(rootEntityType: RootEntityType, args: { [p: string]: any }, context: QueryNodeResolveInfo): QueryNode {
        const itemVariable = new VariableQueryNode(decapitalize(rootEntityType.name));
        const flexSearchType = this.flexSearchTypeGenerator.generate(rootEntityType, false);
        const flexFilterNode = this.buildFlexSearchFilterNode(args, flexSearchType, itemVariable, rootEntityType, context);
        return new BinaryOperationQueryNode(
            new CountQueryNode(
                new FlexSearchQueryNode({
                    rootEntityType: rootEntityType,
                    flexFilterNode: flexFilterNode,
                    itemVariable: itemVariable
                })),
            BinaryOperator.GREATER_THAN,
            new LiteralQueryNode(context.flexSearchMaxFilterableAmountOverride ? context.flexSearchMaxFilterableAmountOverride : DEFAULT_ARANGOSEARCH_MAX_FILTERABLE_AMOUNT));
    }

    private augmentWithCondition(schemaField: QueryNodeField, rootEntityType: RootEntityType): QueryNodeField {
        return {
            ...schemaField,
            transform: (sourceNode, args, context) => {
                const assertionVariable = new VariableQueryNode();
                if (args[FILTER_ARG] || args[ORDER_BY_ARG]) {
                    return new WithPreExecutionQueryNode({
                        preExecQueries: [
                            new PreExecQueryParms({ resultVariable: assertionVariable, query: this.getPreExecQueryNode(rootEntityType, args, context) })
                        ],
                        resultNode: new ConditionalQueryNode(
                            assertionVariable,
                            new RuntimeErrorQueryNode(TOO_MANY_OBJECTS_ERROR, { code: FLEX_SEARCH_TOO_MANY_OBJECTS }),
                            sourceNode)
                    });
                } else {
                    return sourceNode;
                }

            }
        };
    }

    private buildFlexSearchSearchFilterNode(rootEntityType: RootEntityType, itemVariable: VariableQueryNode, expression?: string): QueryNode {
        if (!expression || expression == '') {
            return new ConstBoolQueryNode(true);
        }

        function getQueryNodeFromField(field: Field, path: Field[] = []): QueryNode {
            if (field.type.isObjectType) {
                return field.type.fields.map(value => getQueryNodeFromField(value, path.concat(field))).reduce(or, ConstBoolQueryNode.FALSE);
            }

            function getIdentityNode() {
                if (field.type.isScalarType && (field.type.graphQLScalarType.name === 'Int' || field.type.graphQLScalarType.name === 'Float') && !isNaN(Number(expression))) {
                    return new BinaryOperationQueryNode(new FieldPathQueryNode(itemVariable, path.concat(field)), BinaryOperator.EQUAL, new LiteralQueryNode(Number(expression)));
                } else {
                    return new FlexSearchStartsWithQueryNode(new FieldPathQueryNode(itemVariable, path.concat(field)), new LiteralQueryNode(expression));

                }
            }

            function getOperatorWithLanguageQueryNode() {
                return new OperatorWithLanguageQueryNode(new FieldPathQueryNode(itemVariable, path.concat(field)), BinaryOperatorWithLanguage.FLEX_SEARCH_CONTAINS_PREFIX, new LiteralQueryNode(expression), field.language!);
            }

            return new BinaryOperationQueryNode(
                field.isFlexSearchIndexed && field.isIncludedInSearch ? getIdentityNode() : ConstBoolQueryNode.FALSE,
                BinaryOperator.OR,
                field.isFlexSearchFulltextIndexed && field.isFulltextIncludedInSearch && field.language ? getOperatorWithLanguageQueryNode() : ConstBoolQueryNode.FALSE
            );
        }

        return rootEntityType.fields.filter(value => value.isIncludedInSearch || value.isFulltextIncludedInSearch).map(value => getQueryNodeFromField(value)).reduce(or, ConstBoolQueryNode.FALSE);
    }
}


