import { ParsedObjectProjectSource } from '../../config/parsed-project';
import { compact, mapValues } from '../../utils/utils';

export interface TranslationConfig {
    readonly namespacePath: ReadonlyArray<string>
    readonly language: string
    readonly localRoot: TranslationNamespaceConfig
}

export interface TranslationNamespaceConfig {
    readonly types: { [name: string]: TypeTranslationConfig }
    readonly namespaces: { [name: string ]: TranslationNamespaceConfig }
    readonly fields: { [name: string]: FieldTranslationConfig|string }
}

export interface TypeTranslationConfig {
    readonly singular?: string
    readonly plural?: string
    readonly hint?: string
    readonly fields: { [name: string]: FieldTranslationConfig|string }
}

export interface FieldTranslationConfig {
    readonly label: string
    readonly hint?: string
}

export function parseTranslationConfigs(source: ParsedObjectProjectSource): ReadonlyArray<TranslationConfig> {
    // TODO implement validation
    return compact(Object.keys(source.object).map(key => {
        const obj = source.object[key];
        if (typeof obj !== 'object' || !key.match(/^[a-zA-Z]{2}$/)) {
            return undefined;
        }
        return {
            localRoot: obj as TranslationNamespaceConfig,
            language: key,
            namespacePath: source.namespacePath
        };
    }));
}
