import { ASTNode, DirectiveNode, FieldDefinitionNode, NamedTypeNode, ValueNode } from 'graphql';
import { PermissionsInput } from './permissions';

export interface FieldInput {
    readonly name: string
    readonly description?: string
    readonly typeName: string
    readonly typeNameAST?: NamedTypeNode
    readonly isList?: boolean

    readonly permissions?: PermissionsInput
    readonly defaultValue?: any
    readonly defaultValueASTNode?: DirectiveNode;
    readonly calcMutationOperators?: ReadonlyArray<CalcMutationsOperator>
    readonly isReference?: boolean
    readonly isRelation?: boolean
    readonly inverseOfFieldName?: string
    readonly inverseOfASTNode?: ValueNode

    readonly astNode?: FieldDefinitionNode
}

export enum CalcMutationsOperator {
    MULTIPLY,
    DIVIDE,
    ADD,
    SUBTRACT,
    MODULO,
    APPEND,
    PREPEND
}
