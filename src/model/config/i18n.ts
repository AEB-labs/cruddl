import { ParsedObjectProjectSource } from '../../config/parsed-project';
import { compact, mapValues } from '../../utils/utils';
import { MessageLocation } from '../validation';

export interface LocalizationConfig {
    readonly namespacePath: ReadonlyArray<string>
    readonly language: string
    readonly namespaceContent: NamespaceLocalizationConfig
}

export interface NamespaceLocalizationConfig {
    readonly namespacePath: ReadonlyArray<string>
    readonly types?: { [name: string]: TypeLocalizationConfig }
    readonly fields?: { [name: string]: LocalizationBaseConfig }
    readonly loc?: MessageLocation;
}


export interface TypeLocalizationConfig {
    readonly singular?: string
    readonly plural?: string
    readonly hint?: string
    readonly loc?: MessageLocation
    readonly fields?: { [name: string]: LocalizationBaseConfig }
    readonly values?: { [name: string]: LocalizationBaseConfig }
}

export interface LocalizationBaseConfig {
    readonly label?: string
    readonly hint?: string
    readonly loc?: MessageLocation
}

function normalizeLocalizationBaseConfig(fieldConfigs: { [name: string]: LocalizationBaseConfig | string } | undefined, curYamlPath: string, source: ParsedObjectProjectSource): { [name: string]: LocalizationBaseConfig } | undefined {
    if (!fieldConfigs) {
        return;
    }
    return mapValues(fieldConfigs, (fieldConfig, key) => typeof fieldConfig === 'string' ? { label: fieldConfig, loc: source.pathLocationMap[curYamlPath + '/' + key] } : { label: fieldConfig.label, hint: fieldConfig.hint, loc: source.pathLocationMap[curYamlPath + '/' + key] });
}

function normalizeTypeConfig(typeConfigs: { [name: string]: TypeLocalizationConfig } | undefined, curYamlPath: string, source: ParsedObjectProjectSource): { [name: string]: TypeLocalizationConfig | TypeLocalizationConfig } {
    if (!typeConfigs) {
        return {};
    }
    return mapValues(typeConfigs, (typeConfig, key) => {
            return {
                singular: typeConfig.singular,
                plural: typeConfig.plural,
                hint: typeConfig.hint,
                fields: normalizeLocalizationBaseConfig(typeConfig.fields, curYamlPath + '/types/' + key, source),
                values: normalizeLocalizationBaseConfig(typeConfig.values, curYamlPath + '/types/' + key, source),
                loc: source.pathLocationMap[curYamlPath + '/types/' + key]
            };
        }
    );
}

export function parseI18nConfigs(source: ParsedObjectProjectSource): ReadonlyArray<LocalizationConfig> {
    if (!source.object || !source.object.i18n || typeof source.object.i18n !== 'object') {
        return [];
    }

    const i18n = source.object.i18n as { [language: string]: NamespaceLocalizationConfig };
    return compact(Object.keys(source.object.i18n).map((key: string) => {
        const namespace = i18n[key];
        if (typeof namespace !== 'object') {
            return undefined;
        }

        const curYamlPath = '/i18n/' + key;
        const normalizedFields = normalizeLocalizationBaseConfig(namespace.fields, curYamlPath + '/fields', source);
        const normalizedTypes = normalizeTypeConfig(namespace.types, curYamlPath, source);
        const namespaceConfig: NamespaceLocalizationConfig = {
            namespacePath: source.namespacePath,
            fields: normalizedFields,
            types: normalizedTypes,
            loc: source.pathLocationMap[curYamlPath]
        };

        return {
            namespaceContent: namespaceConfig,
            language: key,
            namespacePath: source.namespacePath
        };
    }));
}
