import { DirectiveNode, ObjectValueNode, StringValueNode } from 'graphql';

export interface IndexDefinitionConfig {
    readonly id?: string,
    readonly fields: ReadonlyArray<string>
    readonly fieldASTNodes?: ReadonlyArray<StringValueNode | DirectiveNode | undefined>
    readonly unique?: boolean
    readonly astNode?: DirectiveNode | ObjectValueNode
}
