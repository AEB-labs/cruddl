import memorize from 'memorize-decorator';
import { arrayStartsWith, compact, flatMap, groupArray, mapFirstDefined, mapValues } from '../../utils/utils';
import { FieldI18nConfig, I18nConfig, NamespaceI18nConfig } from '../config/i18n';
import { ModelComponent, ValidationContext } from '../validation/validation-context';
import { Field } from './field';
import { ObjectTypeBase } from './object-type-base';

export class ModelI18n implements ModelComponent {

    private readonly languageLocalizationProvidersByLanguage: ReadonlyMap<string, LanguageLocalizationProvider>;

    constructor(input: ReadonlyArray<I18nConfig>) {
        // collect configs by language and create one list of namespaces per language
        // collect all countries for which namespaces must be created
        const configsByLanguage = groupArray(input, config => config.language);
        // const namespacesByCountryPrepared
        const namespacesByCountry = new Map<string, LanguageLocalizationProvider>();
        Array.from(configsByLanguage.keys()).forEach(language =>
            namespacesByCountry.set(language, new LanguageLocalizationProvider(flatMap(configsByLanguage.get(language)!,
                config => flattenNamespaceConfigs(config.namespaceContent, config.namespacePath)
                    .map(flatNamespace => new I18nNamespace(flatNamespace)))))
        );
        this.languageLocalizationProvidersByLanguage = namespacesByCountry;
    }

    public validate(context: ValidationContext): void {
    }

    @memorize()
    public getTypeLocalization(type: ObjectTypeBase, resolutionOrder: ReadonlyArray<string>): TypeLocalization {
        const resolutionProviders = this.getResolutionProviders(resolutionOrder);
        // try to build one complete type localization out of the available possibly partial localizations
        return {
            singular: mapFirstDefined(resolutionProviders,rp => rp.localizeType(type).singular),
            plural: mapFirstDefined(resolutionProviders,rp => rp.localizeType(type).plural),
            hint: mapFirstDefined(resolutionProviders,rp => rp.localizeType(type).hint)
        };
    }

    @memorize()
    public getFieldLocalization(field: Field, resolutionOrder: ReadonlyArray<string>): FieldLocalization {
        const resolutionProviders = this.getResolutionProviders(resolutionOrder);
        // try to build one complete field localization out of the available possibly partial localizations
        return {
            label: mapFirstDefined(resolutionProviders,rp => rp.localizeField(field).label),
            hint: mapFirstDefined(resolutionProviders,rp => rp.localizeField(field).hint)
        };
    }

    private getResolutionProviders(resolutionOrder: ReadonlyArray<string>): ReadonlyArray<LocalizationProvider> {
        return compact(resolutionOrder.map(providerName => {
            switch (providerName) {
                    // TODO implement more cool stuff
                default:
                    return this.languageLocalizationProvidersByLanguage.get(providerName);
            }
        }));
    }


}

export class I18nNamespace {
    public readonly namespacePath: ReadonlyArray<string>;
    private readonly typeI18n: ReadonlyArray<TypeI18n>;
    private readonly fieldI18n: ReadonlyArray<FieldI18n>;
    constructor(input: FlatNamespaceI18nConfig) {
        this.namespacePath = input.namespacePath;
        this.typeI18n = this.extractTypes(input);
        this.fieldI18n = this.extractFields(input);
    }

    public getAllLocalizationsForType(name: string) {
        return this.typeI18n.find(typeTrans => typeTrans.name === name);
    }

    public getAllLocalizationsForField(name: string, type: string|undefined): ReadonlyArray<FieldI18n> {
        return compact([
            this.fieldI18n.find(fieldTrans => fieldTrans.name === name && fieldTrans.type === type),
            this.fieldI18n.find(fieldTrans => fieldTrans.name === name && fieldTrans.type === undefined)
        ]);
    }

    private extractFields(input: FlatNamespaceI18nConfig): ReadonlyArray<TypeI18n> {
        return [
            // Namespace fields
            ...Object.keys(input.fields).map(fieldName =>
                ({
                    name: fieldName,
                    label: input.fields[fieldName].label,
                    hint: input.fields[fieldName].hint
                })
            ),
            // Fields from types
            ...flatMap(Object.keys(input.types), typeName =>
                Object.keys(input.types[typeName].fields)
                    .map(fieldName =>
                        ({
                            name: fieldName,
                            label: input.types[typeName].fields[fieldName].label,
                            hint: input.types[typeName].fields[fieldName].hint,
                            type: typeName
                        })
                    )
            )
        ];
    }

    private extractTypes(input: FlatNamespaceI18nConfig): ReadonlyArray<FieldI18n> {
        return Object.keys(input.types).map(typeName => ({
                name: typeName,
                singular: input.types[typeName].singular,
                plural: input.types[typeName].plural,
                hint: input.types[typeName].hint
            })
        );
    }

}

export interface TypeLocalization {
    readonly singular?: string,
    readonly plural?: string,
    readonly hint?: string
}

export interface FieldLocalization {
    readonly label?: string,
    readonly hint?: string,
}

export interface TypeI18n extends TypeLocalization {
    readonly name: string,
}

export interface FieldI18n extends FieldLocalization {
    readonly name: string,
    readonly type?: string
}


function flattenNamespaceConfigs(namespace: NamespaceI18nConfig, basePath: ReadonlyArray<string>): ReadonlyArray<FlatNamespaceI18nConfig> {
    const subNamespaces: FlatNamespaceI18nConfig[] =
        namespace.namespaces ?
            flatMap(Object.keys(namespace.namespaces), key =>
                [
                    ...flattenNamespaceConfigs({
                            ...namespace.namespaces![key]
                        },
                        [...basePath, key])
                ]
            ) : [];
    const flattenedNamespace: FlatNamespaceI18nConfig = {
        fields: normalizeFieldConfig(namespace.fields),
        types: namespace.types ? mapValues(namespace.types, type => ({...type, fields: normalizeFieldConfig(type.fields)})) : {},
        namespacePath: basePath
    };
    return [flattenedNamespace, ...subNamespaces];
}

function normalizeFieldConfig(fieldConfigs: { [name: string]: FieldI18nConfig|string }|undefined): { [name: string]: FieldI18nConfig } {
    if (!fieldConfigs) {
        return {};
    }
    return mapValues(fieldConfigs, fieldConfig => typeof fieldConfig === 'string' ? { label: fieldConfig } : fieldConfig);
}

// Intermediate types

/**
 * A namespace which does not have sub-namespaces
 */
export interface FlatNamespaceI18nConfig {
    readonly types: { [name: string]: NormalizedTypeI18nConfig }
    readonly namespacePath: ReadonlyArray<string>
    readonly fields: { [name: string]: FieldI18nConfig }
}

/** A type localization which uses a FieldI18nConfig for each label */
export interface NormalizedTypeI18nConfig {
    readonly singular?: string
    readonly plural?: string
    readonly hint?: string
    readonly fields: { [name: string]: FieldI18nConfig }
}

interface LocalizationProvider {
    localizeType(type: ObjectTypeBase): TypeLocalization;
    localizeField(field: Field): FieldLocalization;
}

class LanguageLocalizationProvider implements LocalizationProvider {

    constructor(private namespaces: ReadonlyArray<I18nNamespace>) {}

    private getMatchingNamespaces(namespacePath: ReadonlyArray<string>): ReadonlyArray<I18nNamespace> {
        return this.namespaces.filter(set => arrayStartsWith(namespacePath, set.namespacePath))
            .sort((lhs, rhs) => lhs.namespacePath.length - rhs.namespacePath.length);
    }

    localizeType(type: ObjectTypeBase): TypeLocalization {
        const matchingNamespaces = this.getMatchingNamespaces(type.namespacePath);
        const matchingTypeLocalization = compact(matchingNamespaces.map(ns => ns.getAllLocalizationsForType(type.name)));
        return {
            singular: mapFirstDefined(matchingTypeLocalization, t => t.singular),
            plural: mapFirstDefined(matchingTypeLocalization, t => t.plural),
            hint: mapFirstDefined(matchingTypeLocalization, t => t.hint)
        };
    }

    localizeField(field: Field): FieldLocalization {
        const matchingNamespaces = this.getMatchingNamespaces(field.declaringType.namespacePath);
        const matchingFieldLocalization = flatMap(matchingNamespaces, ns => ns.getAllLocalizationsForField(field.name, field.declaringType.name));
        return {
            label: mapFirstDefined(matchingFieldLocalization, t => t.label),
            hint: mapFirstDefined(matchingFieldLocalization, t => t.hint)
        };
    }

}


