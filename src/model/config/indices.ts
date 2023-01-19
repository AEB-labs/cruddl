import { DirectiveNode, EnumValueNode, ObjectValueNode, StringValueNode } from 'graphql';
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
    readonly directiveASTNode?: DirectiveNode;
    readonly primarySort: ReadonlyArray<FlexSearchPrimarySortClauseConfig>;
}
