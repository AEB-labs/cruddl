import {ASTNode, DirectiveNode, FieldDefinitionNode, NamedTypeNode, NameNode, ValueNode} from 'graphql';
import { PermissionsInput } from './permissions';

export interface FieldInput {
    readonly name: string
    readonly description?: string
    readonly typeName: string
    readonly typeNameAST?: NameNode
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
    MULTIPLY = 'MULTIPLY',
    DIVIDE = 'DIVIDE',
    ADD = 'ADD',
    SUBTRACT = 'SUBTRACT',
    MODULO = 'MODULO',
    APPEND = 'APPEND',
    PREPEND = 'PREPEND'
}
