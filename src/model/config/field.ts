import {
    ArgumentNode,
    ASTNode,
    DirectiveNode,
    EnumValueNode,
    FieldDefinitionNode,
    NameNode,
    StringValueNode,
    ValueNode,
} from 'graphql';
import { PermissionsConfig } from './permissions';
import { FieldModuleSpecificationConfig } from './module-specification';

export interface FieldConfig {
    readonly name: string;
    readonly description?: string;
    readonly deprecationReason?: string;
    readonly typeName: string;
    readonly typeNameAST?: NameNode;
    readonly isList?: boolean;

    readonly permissions?: PermissionsConfig;
    readonly defaultValue?: any;
    readonly defaultValueASTNode?: DirectiveNode;
    readonly calcMutationOperators?: ReadonlyArray<CalcMutationsOperator>;
    readonly calcMutationAstNode?: DirectiveNode;

    readonly isReference?: boolean;
    readonly referenceAstNode?: ASTNode;
    readonly referenceKeyField?: string;
    readonly referenceKeyFieldASTNode?: ValueNode;

    readonly isRelation?: boolean;
    readonly relationAstNode?: DirectiveNode;
    readonly inverseOfFieldName?: string;
    readonly inverseOfASTNode?: ValueNode;
    readonly relationDeleteAction?: RelationDeleteAction;
    readonly relationDeleteActionASTNode?: ArgumentNode;

    readonly collect?: CollectFieldConfig;

    readonly isParentField?: boolean;
    readonly parentDirectiveNode?: DirectiveNode;
    readonly isRootField?: boolean;
    readonly rootDirectiveNode?: DirectiveNode;

    readonly astNode?: FieldDefinitionNode;

    readonly isFlexSearchIndexed?: boolean;
    readonly isFlexSearchIndexCaseSensitive?: boolean;
    readonly flexSearchIndexCaseSensitiveASTNode?: ArgumentNode;
    readonly isFlexSearchIndexedASTNode?: DirectiveNode;
    readonly isFlexSearchFulltextIndexed?: boolean;
    readonly isFlexSearchFulltextIndexedASTNode?: DirectiveNode;
    readonly flexSearchLanguage?: FlexSearchLanguage;

    /**
     * Specifies if the field should be included in the expression-search of FlexSearch as a value.
     */
    readonly isIncludedInSearch?: boolean;
    /**
     * Specifies if the field should be included in the expression-search of FlexSearch as a text.
     */
    readonly isFulltextIncludedInSearch?: boolean;

    /**
     * Specifies if this field can be used within restrictions of a permission profile
     *
     * The field does not need to be used within restrictions if this is true.
     */
    readonly isAccessField?: boolean;

    readonly accessFieldDirectiveASTNode?: DirectiveNode;

    /**
     * Whether a field is marked as "hidden". This information can later be used,
     * via the fields meta information, to decide whether the field should be shown in UIs
     * or not.
     */
    readonly isHidden?: boolean;
    readonly isHiddenASTNode?: DirectiveNode;

    readonly moduleSpecification?: FieldModuleSpecificationConfig;
}

export enum RelationDeleteAction {
    REMOVE_EDGES = 'REMOVE_EDGES',
    CASCADE = 'CASCADE',
    RESTRICT = 'RESTRICT',
}

export interface CollectFieldConfig {
    readonly astNode?: DirectiveNode;
    readonly path: string;
    readonly pathASTNode?: StringValueNode;
    readonly aggregationOperator?: AggregationOperator;
    readonly aggregationOperatorASTNode?: EnumValueNode;
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
    COUNT_DISTINCT = 'COUNT_DISTINCT',
}

export interface TraversalConfig {
    readonly astNode?: DirectiveNode;
    readonly path: string;
    readonly pathASTNode?: StringValueNode;
}

export enum CalcMutationsOperator {
    MULTIPLY = 'MULTIPLY',
    DIVIDE = 'DIVIDE',
    ADD = 'ADD',
    SUBTRACT = 'SUBTRACT',
    MODULO = 'MODULO',
    APPEND = 'APPEND',
    PREPEND = 'PREPEND',
}

export enum FlexSearchLanguage {
    EN = 'en',
    DE = 'de',
    ES = 'es',
    FI = 'fi',
    FR = 'fr',
    IT = 'it',
    NL = 'nl',
    NO = 'no',
    PT = 'pt',
    RU = 'ru',
    SV = 'sv',
    ZH = 'zh',
}
