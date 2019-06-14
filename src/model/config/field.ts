import { DirectiveNode, EnumValueNode, FieldDefinitionNode, NameNode, StringValueNode, TypeNode, ValueNode } from 'graphql';
import { PermissionsConfig } from './permissions';

export interface FieldConfig {
    readonly name: string
    readonly description?: string
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

    readonly traversal?: TraversalConfig
    readonly aggregation?: AggregationConfig

    readonly astNode?: FieldDefinitionNode

    readonly isQuickSearchIndexed?: boolean
    readonly isQuickSearchIndexedASTNode?: DirectiveNode
    readonly isQuickSearchFulltextIndexed?: boolean
    readonly isQuickSearchFulltextIndexedASTNode?: DirectiveNode
    readonly quickSearchLanguage?: QuickSearchLanguage
    readonly isIncludedInSearch?: boolean
    readonly isFulltextIncludedInSearch?: boolean
}

export interface TraversalConfig {
    readonly astNode?: DirectiveNode
    readonly path: string
    readonly pathASTNode?: StringValueNode
}

export interface AggregationConfig extends TraversalConfig {
    readonly aggregator: FieldAggregator
    readonly aggregatorASTNode?: EnumValueNode
}

export enum FieldAggregator {
    COUNT = 'COUNT',
    SUM = 'SUM',
    MIN = 'MIN',
    MAX = 'MAX',
    AVERAGE = 'AVERAGE'
}

export interface TraversalConfig {
    readonly astNode?: DirectiveNode
    readonly path: string
    readonly pathASTNode?: StringValueNode
}

export interface AggregationConfig extends TraversalConfig {
    readonly aggregator: FieldAggregator
    readonly aggregatorASTNode?: EnumValueNode
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

export enum QuickSearchLanguage {
    EN = 'en', DE = 'de', ES = 'es', FI = 'fi', FR = 'fr', IT = 'it', NL = 'nl', NO = 'no', PT = 'pt', RU = 'ru', SV = 'sv', ZH = 'zh'
}