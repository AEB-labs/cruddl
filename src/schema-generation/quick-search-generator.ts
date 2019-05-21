import { getMetaFieldName, getQuickSearchEntitiesFieldName } from '../schema/names';
import { OutputTypeGenerator } from './output-type-generator';
import { QueryNodeField, QueryNodeListType, QueryNodeNonNullType, QueryNodeObjectType } from './query-node-object-type';
import { RootEntityType, Type } from '../model/implementation';
import { QUICK_SEARCH_EXPRESSION_ARG, QUICK_SEARCH_FILTER_ARG } from '../schema/constants';
import { QuickSearchFilterObjectType, QuickSearchFilterTypeGenerator } from './quick-search-filter-input-types/generator';
import { GraphQLString } from 'graphql';
import {
    BinaryOperationQueryNode,
    BinaryOperator,
    ConstBoolQueryNode,
    QueryNode,
    VariableQueryNode
} from '../query-tree';
import { decapitalize } from '../utils/utils';
import { QuickSearchQueryNode } from '../query-tree/quick-search';
import { simplifyBooleans } from '../query-tree/utils';


export const QS_QUERYNODE_ONLY_ERROR_MESSAGE = 'The Quicksearch Augmentation is only supported for QuickSearchQueryNodes';

/**
 * Augments list fields with filter and pagination features
 */
export class QuickSearchGenerator {

    constructor(
        private readonly quickSearchTypeGenerator: QuickSearchFilterTypeGenerator,
        private readonly outputTypeGenerator: OutputTypeGenerator
    ) {

    }

    generate(rootEntityType: RootEntityType): QueryNodeField{
        const fieldConfig = ({
            name: getQuickSearchEntitiesFieldName(rootEntityType.name),
            type: new QueryNodeListType(new QueryNodeNonNullType(this.outputTypeGenerator.generate(rootEntityType))),
            description: `Searches for ${rootEntityType.pluralName} using QuickSearch.`,
            resolve: () => new QuickSearchQueryNode({ rootEntityType: rootEntityType })
        });
        return this.generateFromConfig(fieldConfig,rootEntityType)
    }

    generateMeta(rootEntityType: RootEntityType, metaType: QueryNodeObjectType): QueryNodeField{
        const fieldConfig = ({
            name: getMetaFieldName(getQuickSearchEntitiesFieldName(rootEntityType.name)),
            type: new QueryNodeNonNullType(metaType),
            description: `Searches for ${rootEntityType.pluralName} using QuickSearch.`,
            // meta fields should never be null. Also, this is crucial for performance. Without it, we would introduce
            // an unnecessary variable with the collection contents (which is slow) and we would to an equality check of
            // a collection against NULL which is deadly (v8 evaluation)
            skipNullCheck: true,
            resolve: () => new QuickSearchQueryNode({ rootEntityType: rootEntityType })
        });
        return this.generateFromConfig(fieldConfig,rootEntityType);
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
                let parentNode = schemaField.resolve(sourceNode, args, info);
                if (parentNode instanceof QuickSearchQueryNode) {
                    const itemVariable = new VariableQueryNode(decapitalize(rootEntityType.name));
                    const qsFilterNode = this.buildQuickSearchFilterNode(parentNode, args, quickSearchType, rootEntityType, itemVariable);
                    return new QuickSearchQueryNode({
                        rootEntityType: parentNode.rootEntityType,
                        isGlobal: parentNode.isGlobal,
                        qsFilterNode: qsFilterNode,
                        itemVariable: itemVariable
                    });
                } else {
                    throw new Error(QS_QUERYNODE_ONLY_ERROR_MESSAGE);
                }

            }
        };


    };

    private buildQuickSearchFilterNode(listNode: QueryNode, args: { [p: string]: any }, filterType: QuickSearchFilterObjectType, itemType: Type, itemVariable: VariableQueryNode) {
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
}


