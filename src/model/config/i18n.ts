import { ParsedObjectProjectSource } from '../../config/parsed-project';
import { compact } from '../../utils/utils';

export interface LocalizationConfig {
    readonly namespacePath: ReadonlyArray<string>
    readonly language: string
    readonly namespaceContent: NamespaceLocalizationConfig
}

export interface NamespaceLocalizationConfig {
    readonly namespacePath: ReadonlyArray<string>
    readonly language: string
    readonly types?: { [name: string]: TypeLocalizationConfig }
    readonly namespaces?: { [name: string ]: NamespaceLocalizationConfig }
    readonly fields?: { [name: string]: FieldLocalizationConfig|string }
}

export interface TypeLocalizationConfig {
    readonly singular?: string
    readonly plural?: string
    readonly hint?: string
    readonly fields?: { [name: string]: FieldLocalizationConfig|string }

}

export interface FieldLocalizationConfig {
    readonly label?: string
    readonly hint?: string
}

export function parseI18nConfigs(source: ParsedObjectProjectSource): ReadonlyArray<LocalizationConfig> {
    // TODO do always return fields as FieldLocalizationConfig -> normalizeFieldConfig()
    // add messageLocations to everything
    if (!source.object || !source.object.i18n || typeof source.object.i18n !== 'object') {
        return []
    }
    const i18n = source.object.i18n as {[language: string]: NamespaceLocalizationConfig};
    return compact(Object.keys(source.object.i18n).map((key: string) => {
        const namespace = i18n[key];
        if (typeof namespace !== 'object') {
            return undefined;
        }
        return {
            namespaceContent: namespace as NamespaceLocalizationConfig,
            language: key,
            namespacePath: source.namespacePath
        };
    }));
}
