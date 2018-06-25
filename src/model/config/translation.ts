import { ParsedObjectProjectSource } from '../../config/parsed-project';
import { compact } from '../../utils/utils';

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
    if (!source.object || !source.object.translations || typeof source.object.translations !== 'object') {
        return []
    }
    const translations = source.object.translations as {[language: string]: TranslationNamespaceConfig};
    return compact(Object.keys(source.object.translations).map((key: string) => {
        const namespace = translations[key];
        if (typeof namespace !== 'object') {
            return undefined;
        }
        return {
            localRoot: namespace as TranslationNamespaceConfig,
            language: key,
            namespacePath: source.namespacePath
        };
    }));
}
