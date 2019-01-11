import { DirectiveNode, ObjectValueNode, StringValueNode } from 'graphql';

export interface IndexDefinitionConfig {
    readonly id?: string,
    readonly fields: ReadonlyArray<string>
    readonly fieldASTNodes?: ReadonlyArray<StringValueNode | DirectiveNode | undefined>
    readonly unique?: boolean

    /**
     * If set to true, the index will not contain any values where one of the fields is null.
     *
     * If unspecified, the value depends on unique: unique indices default to sparse, non-unique indices default to
     * non-sparse.
     */
    readonly sparse?: boolean

    readonly astNode?: DirectiveNode | ObjectValueNode
}
