import * as pluralize from 'pluralize';
import memorize from 'memorize-decorator';
import { globalContext } from '../../config/global';
import { I18N_GENERIC, I18N_WARNING } from '../../meta-schema/constants';
import { NAMESPACE_SEPARATOR } from '../../schema/constants';
import {
    arrayStartsWith, capitalize, compact, decapitalize, flatMap, groupArray, mapFirstDefined, mapValues
} from '../../utils/utils';
import { FieldLocalizationConfig, LocalizationConfig, NamespaceLocalizationConfig } from '../config/i18n';
import { ModelComponent, ValidationContext } from '../validation/validation-context';
import { Field } from './field';
import { Model } from './model';
import { ObjectTypeBase } from './object-type-base';

export class ModelI18n implements ModelComponent {

    private readonly languageLocalizationProvidersByLanguage: ReadonlyMap<string, ModelLocalizationProvider>;

    constructor(input: ReadonlyArray<LocalizationConfig>, private readonly model: Model) {
        // collect configs by language and create one list of namespaces per language
        // collect all countries for which namespaces must be created
        const configsByLanguage = groupArray(input, config => config.language);
        // const namespacesByCountryPrepared
        const localizationMap = new Map<string, ModelLocalizationProvider>();
        Array.from(configsByLanguage.keys()).forEach(language =>
            localizationMap.set(language, new ModelLocalizationProvider(flatMap(configsByLanguage.get(language)!,
                config => flattenNamespaceConfigs(config.namespaceContent, config.namespacePath)
                    .map(flatNamespace => new NamespaceLocalization(flatNamespace)))))
        );
        this.languageLocalizationProvidersByLanguage = localizationMap;
    }

    public validate(context: ValidationContext): void {
        // todo perform localization checks
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
                case I18N_GENERIC:
                    return new GenericLocalizationProvider();
                case I18N_WARNING:
                    return new WarningLocalizationProvider(resolutionOrder);
                default:
                    return this.languageLocalizationProvidersByLanguage.get(providerName);
            }
        }));
    }


}

export class NamespaceLocalization {
    public readonly namespacePath: ReadonlyArray<string>;
    private readonly typeI18n: ReadonlyArray<TypeI18n>;
    private readonly fieldI18n: ReadonlyArray<FieldI18n>;
    constructor(input: FlatNamespaceLocalizationConfig) {
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

    private extractFields(input: FlatNamespaceLocalizationConfig): ReadonlyArray<FieldI18n> {
        return [
            // Namespace fields
            ...Object.keys(input.fields).map((fieldName): FieldI18n =>
                ({
                    name: fieldName,
                    label: input.fields[fieldName].label,
                    hint: input.fields[fieldName].hint
                })
            ),
            // Fields from types
            ...flatMap(Object.keys(input.types), typeName =>
                Object.keys(input.types[typeName].fields)
                    .map((fieldName): FieldI18n =>
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

    private extractTypes(input: FlatNamespaceLocalizationConfig): ReadonlyArray<TypeI18n> {
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


function flattenNamespaceConfigs(namespace: NamespaceLocalizationConfig, basePath: ReadonlyArray<string>): ReadonlyArray<FlatNamespaceLocalizationConfig> {
    const subNamespaces: FlatNamespaceLocalizationConfig[] =
        namespace.namespaces ?
            flatMap(Object.keys(namespace.namespaces), key =>
                [
                    ...flattenNamespaceConfigs({
                            ...namespace.namespaces![key]
                        },
                        [...basePath, key])
                ]
            ) : [];
    const flattenedNamespace: FlatNamespaceLocalizationConfig = {
        fields: normalizeFieldConfig(namespace.fields),
        types: namespace.types ? mapValues(namespace.types, type => ({...type, fields: normalizeFieldConfig(type.fields)})) : {},
        namespacePath: basePath
    };
    return [flattenedNamespace, ...subNamespaces];
}

function normalizeFieldConfig(fieldConfigs: { [name: string]: FieldLocalizationConfig|string }|undefined): { [name: string]: FieldLocalizationConfig } {
    if (!fieldConfigs) {
        return {};
    }
    return mapValues(fieldConfigs, fieldConfig => typeof fieldConfig === 'string' ? { label: fieldConfig } : fieldConfig);
}

// Intermediate types

/**
 * A namespace which does not have sub-namespaces
 */
export interface FlatNamespaceLocalizationConfig {
    readonly types: { [name: string]: NormalizedTypeI18nConfig }
    readonly namespacePath: ReadonlyArray<string>
    readonly fields: { [name: string]: FieldLocalizationConfig }
}

/** A type localization which uses a FieldLocalizationConfig for each label */
export interface NormalizedTypeI18nConfig {
    // TODO replace by TypeLocalizationConfig
    readonly singular?: string
    readonly plural?: string
    readonly hint?: string
    readonly fields: { [name: string]: FieldLocalizationConfig }
}

interface LocalizationProvider {
    localizeType(type: ObjectTypeBase): TypeLocalization;
    localizeField(field: Field): FieldLocalization;
}

class ModelLocalizationProvider implements LocalizationProvider {

    constructor(private namespaces: ReadonlyArray<NamespaceLocalization>) {}


    private getMatchingNamespaces(namespacePath: ReadonlyArray<string>): ReadonlyArray<NamespaceLocalization> {
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
        /**
         * types:
         *   Delivery
         *     fields:
         *       createdAt
         * namespaces:
         *   types:
         *     Delivery
         *       fields:
         *         createdAt
         *   model
         *     fields:
         *       createdAt
         *
         */
    }

}

class GenericLocalizationProvider implements LocalizationProvider {

    localizeField(field: Field): FieldLocalization {
        return {
            label: generateGenericName(field.name)
        }
    }

    localizeType(type: ObjectTypeBase): TypeLocalization {
        return {
            singular: generateGenericName(type.name),
            plural: GenericLocalizationProvider.generatePluralName(type.name)
        }
    }

    static generatePluralName(name: string|undefined): string|undefined {
        name = generateGenericName(name);
        if (name == undefined || name === '') {
            return undefined;
        }
        let splitName = name.split(' ');
        return [...splitName, pluralize(splitName.pop()!)].join(' ');
    }
}

function generateGenericName(name: string|undefined): string|undefined {
    if (name == undefined) {
        return undefined;
    }
    return capitalize(name.replace(/([a-z])([A-Z])/g, (str, arg1, arg2) => `${arg1} ${decapitalize(arg2)}`));
}

class WarningLocalizationProvider implements LocalizationProvider {

    private resolutionOrderWithoutResult: ReadonlyArray<string>;

    constructor(resolutionOrder: ReadonlyArray<string>) {
        // create a list of all tried languages.
        this.resolutionOrderWithoutResult = resolutionOrder.slice(0, resolutionOrder.indexOf(I18N_WARNING))
    }

    logger = globalContext.loggerProvider.getLogger('i18n');

    localizeField(field: Field): FieldLocalization {
        this.logger.warn(`Missing i18n for field ${field.declaringType.namespacePath.join(NAMESPACE_SEPARATOR)}.${field.declaringType.name}.${field.name} in language: ${this.resolutionOrderWithoutResult.join(', ')}`);
        return {
        }
    }

    localizeType(type: ObjectTypeBase): TypeLocalization {
        this.logger.warn(`Missing i18n for type ${type.namespacePath.join(NAMESPACE_SEPARATOR)}.${type.name} in language: ${this.resolutionOrderWithoutResult.join(', ')}`);
        return {
        }
    }
}