import { DirectiveNode, FieldDefinitionNode, NameNode, ValueNode } from 'graphql';
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

    readonly astNode?: FieldDefinitionNode

    readonly isQuickSearchIndexed: boolean
    readonly isQuickSearchIndexedASTNode?: DirectiveNode
    readonly isQuickSearchFulltextIndexed: boolean
    readonly isQuickSearchFulltextIndexedASTNode?: DirectiveNode
    readonly quickSearchLanguage?: QuickSearchLanguage
    readonly isSearchable: boolean

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