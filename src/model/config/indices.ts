import {
    ArgumentNode,
    DirectiveNode,
    EnumValueNode,
    IntValueNode,
    ObjectValueNode,
    StringValueNode,
    ValueNode,
} from 'graphql';
import { OrderDirection } from '../implementation/order';

export interface IndexDefinitionConfig {
    readonly name?: string;
    readonly nameASTNode?: StringValueNode;
    /**
     * A list of dot-separated fields that make up this index
     */
    readonly fields: ReadonlyArray<string>;
    readonly fieldASTNodes?: ReadonlyArray<StringValueNode | DirectiveNode | undefined>;
    readonly unique?: boolean;

    /**
     * If set to true, the index will not contain any values where one of the fields is null.
     *
     * If unspecified, the value depends on unique: unique indices default to sparse, non-unique indices default to
     * non-sparse.
     */
    readonly sparse?: boolean;

    readonly astNode?: DirectiveNode | ObjectValueNode;
}

export interface FlexSearchPrimarySortClauseConfig {
    readonly field: string;
    readonly direction: OrderDirection;

    readonly fieldASTNode?: StringValueNode;

    readonly directionASTNode?: EnumValueNode;
}

export interface FlexSearchIndexConfig {
    readonly isIndexed: boolean;
    readonly isIndexedAstNode?: ArgumentNode;
    readonly primarySort: ReadonlyArray<FlexSearchPrimarySortClauseConfig>;
    readonly primarySortAstNode?: ArgumentNode;

    /**
     * Bundled non-functional, optional parameters for flexsearch performance optimizations
     */
    readonly performanceParams?: FlexSearchPerformanceParams;
}

/**
 * Bundles non-functional, optional parameters for flexsearch performance optimizations
 */
export interface FlexSearchPerformanceParams {
    /**
     * The time in milliseconds after which data changes will be visible in flexSearch queries
     */
    readonly commitIntervalMsec?: number;
    readonly commitIntervalMsecASTNode?: ValueNode;

    /**
     * The interval at which a consolidation policy is applied to the flexSearch view
     */
    readonly consolidationIntervalMsec?: number;
    readonly consolidationIntervalMsecASTNode?: ValueNode;

    /**
     * Wait at least this many commits before removing unused files in the data directory
     */
    readonly cleanupIntervalStep?: number;
    readonly cleanupIntervalStepASTNode?: ValueNode;
}
