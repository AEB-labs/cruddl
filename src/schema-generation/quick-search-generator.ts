import { getMetaFieldName, getQuickSearchEntitiesFieldName } from '../schema/names';
import { ListAugmentation } from './list-augmentation';
import { OutputTypeGenerator } from './output-type-generator';
import { QueryNodeField, QueryNodeListType, QueryNodeNonNullType, QueryNodeObjectType } from './query-node-object-type';
import { RootEntityType, Type } from '../model/implementation';
import { QUICK_SEARCH_EXPRESSION_ARG, QUICK_SEARCH_FILTER_ARG } from '../schema/constants';
import { QuickSearchFilterObjectType, QuickSearchFilterTypeGenerator } from './quick-search-filter-input-types/generator';
import { GraphQLString } from 'graphql';
import {
    BinaryOperationQueryNode,
    BinaryOperator, ConditionalQueryNode,
    ConstBoolQueryNode, CountQueryNode, LiteralQueryNode, PreExecQueryParms,
    QueryNode, RuntimeErrorQueryNode, TransformListQueryNode,
    VariableQueryNode, WithPreExecutionQueryNode
} from '../query-tree';
import { decapitalize } from '../utils/utils';
import { QuickSearchQueryNode } from '../query-tree/quick-search';
import { simplifyBooleans } from '../query-tree/utils';


export const QS_QUERYNODE_ONLY_ERROR_MESSAGE = 'The Quicksearch Augmentation is only supported for QuickSearchQueryNodes';

const MAX_AMOUNT_OF_FILTER_AND_SORTABLE_OBJECTS: number = 1000;

/**
 * Augments list fields with filter and pagination features
 */
export class QuickSearchGenerator {


    constructor(
        private readonly quickSearchTypeGenerator: QuickSearchFilterTypeGenerator,
        private readonly outputTypeGenerator: OutputTypeGenerator,
        private readonly listAugmentation: ListAugmentation
    ) {

    }

    generate(rootEntityType: RootEntityType): QueryNodeField {
        const fieldConfig = ({
            name: getQuickSearchEntitiesFieldName(rootEntityType.name),
            type: new QueryNodeListType(new QueryNodeNonNullType(this.outputTypeGenerator.generate(rootEntityType))),
            description: `Searches for ${rootEntityType.pluralName} using QuickSearch.`,
            resolve: () => new QuickSearchQueryNode({ rootEntityType: rootEntityType })
        });
        return this.augmentWithCondition(this.listAugmentation.augment(this.generateFromConfig(fieldConfig, rootEntityType), rootEntityType), rootEntityType);
    }

    generateMeta(rootEntityType: RootEntityType, metaType: QueryNodeObjectType): QueryNodeField {
        const fieldConfig: QueryNodeField = ({
            name: getMetaFieldName(getQuickSearchEntitiesFieldName(rootEntityType.name)),
            type: new QueryNodeNonNullType(metaType),
            description: `Searches for ${rootEntityType.pluralName} using QuickSearch.`,
            // meta fields should never be null. Also, this is crucial for performance. Without it, we would introduce
            // an unnecessary variable with the collection contents (which is slow) and we would to an equality check of
            // a collection against NULL which is deadly (v8 evaluation)
            skipNullCheck: true,
            resolve: () => {
                return new QuickSearchQueryNode({ rootEntityType: rootEntityType }
                );
            }
        });
        return this.generateFromConfig(fieldConfig, rootEntityType);
    }

    generateFromConfig(schemaField: QueryNodeField, rootEntityType: RootEntityType): QueryNodeField {
        if (!rootEntityType.isObjectType) {
            return schemaField;
        }
        const quickSearchType = this.quickSearchTypeGenerator.generate(rootEntityType);
        return {
            ...schemaField,
            args: {
                ...schemaField.args,
                [QUICK_SEARCH_FILTER_ARG]: {
                    type: quickSearchType.getInputType()
                },
                [QUICK_SEARCH_EXPRESSION_ARG]: {
                    type: GraphQLString
                }
            },
            resolve: (sourceNode, args, info) => {
                const itemVariable = new VariableQueryNode(decapitalize(rootEntityType.name));
                const qsFilterNode = this.buildQuickSearchFilterNode(args, quickSearchType, itemVariable);
                return new QuickSearchQueryNode({
                    rootEntityType: rootEntityType,
                    isGlobal: false,
                    qsFilterNode: qsFilterNode,
                    itemVariable: itemVariable
                });
            }


        };


    };

    private buildQuickSearchFilterNode(args: { [p: string]: any }, filterType: QuickSearchFilterObjectType, itemVariable: VariableQueryNode) {
        const filterValue = args[QUICK_SEARCH_FILTER_ARG] || {};
        const expression = args[QUICK_SEARCH_EXPRESSION_ARG] as string;
        const filterNode = simplifyBooleans(filterType.getFilterNode(itemVariable, filterValue));
        const searchFilterNode = simplifyBooleans(filterType.getSearchFilterNode(itemVariable, expression));
        if (searchFilterNode === ConstBoolQueryNode.FALSE) {
            return filterNode;
        } else {
            return simplifyBooleans(new BinaryOperationQueryNode(filterNode, BinaryOperator.AND, searchFilterNode));
        }

    }

    private getPreExecQueryNode(rootEntityType: RootEntityType, args: { [p: string]: any }): QueryNode {
        const itemVariable = new VariableQueryNode(decapitalize(rootEntityType.name));
        const quickSearchType = this.quickSearchTypeGenerator.generate(rootEntityType);
        const qsFilterNode = this.buildQuickSearchFilterNode(args, quickSearchType, itemVariable);
        return new BinaryOperationQueryNode(
            new CountQueryNode(
                new QuickSearchQueryNode({
                    rootEntityType: rootEntityType,
                    isGlobal: false,
                    qsFilterNode: qsFilterNode,
                    itemVariable: itemVariable
                })),
            BinaryOperator.GREATER_THAN,
            new LiteralQueryNode(MAX_AMOUNT_OF_FILTER_AND_SORTABLE_OBJECTS));
    }

    private augmentWithCondition(schemaField: QueryNodeField, rootEntityType: RootEntityType): QueryNodeField {

        return {
            ...schemaField,
            resolve: (sourceNode, args, info) => {
                const parentNode = schemaField.resolve(sourceNode, args, info);
                if(!(parentNode instanceof TransformListQueryNode)){
                    return parentNode;
                }
                if(parentNode.filterNode.equals(ConstBoolQueryNode.TRUE) && parentNode.orderBy.isUnordered()){
                    return parentNode;
                }

                const assertionVariable = new VariableQueryNode();
                return new WithPreExecutionQueryNode({
                    preExecQueries: [
                        new PreExecQueryParms({ resultVariable: assertionVariable, query: this.getPreExecQueryNode(rootEntityType,args) })
                    ],
                    resultNode: new ConditionalQueryNode(
                        assertionVariable,
                        new RuntimeErrorQueryNode('Too many objects'),
                        parentNode)
                });
            }
        };
    }
}


