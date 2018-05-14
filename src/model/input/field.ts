import { ASTNode, FieldDefinitionNode, NamedTypeNode, ValueNode } from 'graphql';
import { PermissionsInput } from './permissions';

export interface FieldInput {
    name: string
    description?: string
    typeName: string
    typeNameAST?: NamedTypeNode
    isList: boolean

    permissions?: PermissionsInput
    defaultValue?: any
    calcMutationOperators: CalcMutationsOperator[]
    isReference: boolean
    isRelation: boolean
    inverseOfFieldName?: string
    inverseOfASTNode?: ValueNode

    astNode?: FieldDefinitionNode
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
