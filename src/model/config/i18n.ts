import { ParsedObjectProjectSource } from '../../config/parsed-project';
import { compact } from '../../utils/utils';

export interface I18nConfig {
    readonly namespacePath: ReadonlyArray<string>
    readonly language: string
    readonly namespaceContent: NamespaceI18nConfig
}

export interface NamespaceI18nConfig {
    readonly types?: { [name: string]: TypeI18nConfig }
    readonly namespaces?: { [name: string ]: NamespaceI18nConfig }
    readonly fields?: { [name: string]: FieldI18nConfig|string }
}

export interface TypeI18nConfig {
    readonly singular?: string
    readonly plural?: string
    readonly hint?: string
    readonly fields?: { [name: string]: FieldI18nConfig|string }
}

export interface FieldI18nConfig {
    readonly label: string
    readonly hint?: string
}

export function parseI18nConfigs(source: ParsedObjectProjectSource): ReadonlyArray<I18nConfig> {
    if (!source.object || !source.object.i18n || typeof source.object.i18n !== 'object') {
        return []
    }
    const i18n = source.object.i18n as {[language: string]: NamespaceI18nConfig};
    return compact(Object.keys(source.object.i18n).map((key: string) => {
        const namespace = i18n[key];
        if (typeof namespace !== 'object') {
            return undefined;
        }
        return {
            namespaceContent: namespace as NamespaceI18nConfig,
            language: key,
            namespacePath: source.namespacePath
        };
    }));
}
