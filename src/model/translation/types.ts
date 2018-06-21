export interface ModelTranslationsMap {
    [languageIso: string]: ModelTranslation
}

export interface ModelTranslation {
    readonly types: {[typeName: string]: TypeTranslation}
    readonly fields: FieldTranslation
}

export interface TypeTranslation {
    readonly singular?: string
    readonly plural?: string
    readonly hint?: string
    readonly fields?: FieldTranslation
}

export type FieldTranslation = { [fieldName: string]: { label: string, hint: string } }


