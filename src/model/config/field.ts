import { DirectiveNode, EnumValueNode, FieldDefinitionNode, NameNode, StringValueNode, TypeNode, ValueNode } from 'graphql';
import { PermissionsConfig } from './permissions';

export interface FieldConfig {
    readonly name: string
    readonly description?: string
    readonly deprecationReason?: string
    readonly typeName: string
    readonly typeNameAST?: NameNode
    readonly isList?: boolean

    readonly permissions?: PermissionsConfig
    readonly defaultValue?: any
    readonly defaultValueASTNode?: DirectiveNode;
    readonly calcMutationOperators?: ReadonlyArray<CalcMutationsOperator>

    readonly isReference?: boolean
    readonly referenceKeyField?: string
    readonly referenceKeyFieldASTNode?: ValueNode

    readonly isRelation?: boolean
    readonly inverseOfFieldName?: string
    readonly inverseOfASTNode?: ValueNode

    readonly collect?: CollectFieldConfig

    readonly astNode?: FieldDefinitionNode
}

export interface CollectFieldConfig {
    readonly astNode?: DirectiveNode
    readonly path: string
    readonly pathASTNode?: StringValueNode
    readonly aggregationOperator?: AggregationOperator
    readonly aggregationOperatorASTNode?: EnumValueNode
}

export enum AggregationOperator {
    COUNT = 'COUNT',
    SOME = 'SOME',
    NONE = 'NONE',

    COUNT_NULL = 'COUNT_NULL',
    COUNT_NOT_NULL = 'COUNT_NOT_NULL',
    SOME_NULL = 'SOME_NULL',
    SOME_NOT_NULL = 'SOME_NOT_NULL',
    EVERY_NULL = 'EVERY_NULL',
    NONE_NULL = 'NONE_NULL',

    MIN = 'MIN',
    MAX = 'MAX',
    SUM = 'SUM',
    AVERAGE = 'AVERAGE',

    COUNT_TRUE = 'COUNT_TRUE',
    COUNT_NOT_TRUE = 'COUNT_NOT_TRUE',
    SOME_TRUE = 'SOME_TRUE',
    SOME_NOT_TRUE = 'SOME_NOT_TRUE',
    EVERY_TRUE = 'EVERY_TRUE',
    NONE_TRUE = 'NONE_TRUE',

    DISTINCT = 'DISTINCT',
    COUNT_DISTINCT = 'COUNT_DISTINCT'
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
