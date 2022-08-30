import { ParsedObjectProjectSource } from '../config/parsed-project';
import { compact, mapValues } from '../utils/utils';
import {
    LocalizationBaseConfig,
    LocalizationConfig,
    NamespaceLocalizationConfig,
    TypeLocalizationConfig,
} from './config';

function normalizeLocalizationBaseConfig(
    fieldConfigs: { [name: string]: LocalizationBaseConfig | string } | undefined,
    curYamlPath: string,
    source: ParsedObjectProjectSource,
): { [name: string]: LocalizationBaseConfig } | undefined {
    if (!fieldConfigs) {
        return undefined;
    }

    return mapValues(fieldConfigs, (fieldConfig, key) => {
        if (typeof fieldConfig === 'string') {
            return {
                label: fieldConfig,
                loc: source.pathLocationMap[curYamlPath + '/' + key],
            };
        }
        return {
            label: fieldConfig.label,
            hint: fieldConfig.hint,
            loc: source.pathLocationMap[curYamlPath + '/' + key],
        };
    });
}

function normalizeTypeConfig(
    typeConfigs: { [name: string]: TypeLocalizationConfig } | undefined,
    curYamlPath: string,
    source: ParsedObjectProjectSource,
): { [name: string]: TypeLocalizationConfig | TypeLocalizationConfig } {
    if (!typeConfigs) {
        return {};
    }
    return mapValues(typeConfigs, (typeConfig, key) => {
        const typeYamlPath = curYamlPath + '/' + key;
        return {
            label: typeConfig.label,
            labelPlural: typeConfig.labelPlural,
            hint: typeConfig.hint,
            fields: normalizeLocalizationBaseConfig(
                typeConfig.fields,
                typeYamlPath + '/fields',
                source,
            ),
            values: normalizeLocalizationBaseConfig(
                typeConfig.values,
                typeYamlPath + '/values',
                source,
            ),
            loc: source.pathLocationMap[typeYamlPath],
        };
    });
}

export function parseI18nConfigs(
    source: ParsedObjectProjectSource,
): ReadonlyArray<LocalizationConfig> {
    if (!source.object || !source.object.i18n || typeof source.object.i18n !== 'object') {
        return [];
    }

    const i18n = source.object.i18n as { [language: string]: NamespaceLocalizationConfig };
    return compact(
        Object.keys(i18n).map((key: string): LocalizationConfig | undefined => {
            const namespace = i18n[key];
            if (typeof namespace !== 'object') {
                return undefined;
            }

            const curYamlPath = '/i18n/' + key;
            const normalizedFields = normalizeLocalizationBaseConfig(
                namespace.fields,
                curYamlPath + '/fields',
                source,
            );
            const normalizedTypes = normalizeTypeConfig(
                namespace.types,
                curYamlPath + '/types',
                source,
            );

            return {
                language: key,
                namespacePath: source.namespacePath,
                fields: normalizedFields,
                types: normalizedTypes,
                loc: source.pathLocationMap[curYamlPath],
            };
        }),
    );
}
