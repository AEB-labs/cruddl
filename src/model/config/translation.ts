export interface TranslationConfig {
    readonly namespacePath: ReadonlyArray<string>
    readonly language: string
    readonly localRoot: TranslationNamespaceConfig
}

export interface TranslationNamespaceConfig extends TranslationConfigNodeBase {
    readonly kind: 'TranslationNamespaceConfig'
    readonly definitions: { [name: string]: TranslationConfigNode }
    readonly fields: { [name: string]: FieldTranslationConfig }
}

export interface TypeTranslationConfig extends TranslationConfigNodeBase {
    readonly kind: 'TypeTranslationConfig'
    readonly singular?: string
    readonly plural?: string
    readonly hint?: string
    readonly fields: { [name: string]: FieldTranslationConfig }
}

export interface FieldTranslationConfig extends TranslationConfigNodeBase{
    readonly kind: 'FieldTranslationConfig'
    readonly label: string
    readonly hint?: string
}

export interface TranslationConfigNodeBase {
    kind: string
}

export type TranslationConfigNode = TranslationNamespaceConfig|TypeTranslationConfig