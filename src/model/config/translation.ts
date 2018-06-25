export interface TranslationConfig {
    readonly namespacePath: ReadonlyArray<string>
    readonly language: string
    readonly localRoot: TranslationNamespaceConfig
}

export interface TranslationNamespaceConfig {
    readonly types: { [name: string]: TypeTranslationConfig }
    readonly namespaces: { [name: string ]: TranslationNamespaceConfig }
    readonly fields: { [name: string]: FieldTranslationConfig }
}

export interface TypeTranslationConfig {
    readonly singular?: string
    readonly plural?: string
    readonly hint?: string
    readonly fields: { [name: string]: FieldTranslationConfig }
}

export interface FieldTranslationConfig {
    readonly label: string
    readonly hint?: string
}
