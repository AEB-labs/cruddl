import { I18N_GENERIC, I18N_LOCALE } from '../../meta-schema/constants';
import {
    arrayStartsWith,
    capitalize,
    compact,
    decapitalize,
    groupArray,
    mapFirstDefined,
    mapValues,
} from '../../utils/utils';
import {
    LocalizationBaseConfig,
    LocalizationConfig,
    NamespaceLocalizationConfig,
    TypeLocalizationConfig,
} from '../config';
import { MessageLocation, ValidationMessage } from '../validation';
import { ModelComponent, ValidationContext } from '../validation/validation-context';
import { EnumValue } from './enum-type';
import { Field } from './field';
import { Model } from './model';
import { Type } from './type';
import { TypeBase } from './type-base';

export class ModelI18n implements ModelComponent {
    private readonly languageLocalizationProvidersByLanguage: ReadonlyMap<
        string,
        ModelLocalizationProvider
    >;

    constructor(
        input: ReadonlyArray<LocalizationConfig>,
        private readonly model: Model,
    ) {
        // collect configs by language and create one localization provider per language
        const configsByLanguage = groupArray(input, (config) => config.language);
        const localizationsByLanguage = mapValues(configsByLanguage, (configs) =>
            configs.map((config) => new NamespaceLocalization(config)),
        );
        this.languageLocalizationProvidersByLanguage = mapValues(
            localizationsByLanguage,
            (localizations) => new ModelLocalizationProvider(localizations),
        );
    }

    public validate(context: ValidationContext): void {
        for (const localizationProvider of this.languageLocalizationProvidersByLanguage.values()) {
            localizationProvider.validate(context, this.model);
        }
    }

    public getTypeLocalization(
        type: TypeBase,
        resolutionOrder: ReadonlyArray<string>,
    ): TypeLocalization {
        const resolutionProviders = this.getResolutionProviders(resolutionOrder);
        // try to build one complete type localization out of the available possibly partial localizations
        return {
            label: mapFirstDefined(resolutionProviders, (rp) => rp.localizeType(type).label),
            labelPlural: mapFirstDefined(
                resolutionProviders,
                (rp) => rp.localizeType(type).labelPlural,
            ),
            hint: mapFirstDefined(resolutionProviders, (rp) => rp.localizeType(type).hint),
        };
    }

    public getTypeI18n(type: TypeBase): Record<string, TypeLocalization> {
        return mapValues(this.getAllLocalizationProviders(), (provider) =>
            provider.localizeType(type),
        );
    }

    public getFieldLocalization(
        field: Field,
        resolutionOrder: ReadonlyArray<string>,
    ): FieldLocalization {
        const resolutionProviders = this.getResolutionProviders(resolutionOrder);
        // try to build one complete field localization out of the available possibly partial localizations

        return {
            label: mapFirstDefined(resolutionProviders, (rp) => rp.localizeField(field).label),
            hint: mapFirstDefined(resolutionProviders, (rp) => rp.localizeField(field).hint),
        };
    }

    public getFieldI18n(field: Field): Record<string, FieldLocalization> {
        return mapValues(this.getAllLocalizationProviders(), (provider) =>
            provider.localizeField(field),
        );
    }

    public getEnumValueLocalization(
        enumValue: EnumValue,
        resolutionOrder: ReadonlyArray<string>,
    ): EnumValueLocalization {
        const resolutionProviders = this.getResolutionProviders(resolutionOrder);
        return {
            label: mapFirstDefined(
                resolutionProviders,
                (rp) => rp.localizeEnumValue(enumValue).label,
            ),
            hint: mapFirstDefined(
                resolutionProviders,
                (rp) => rp.localizeEnumValue(enumValue).hint,
            ),
        };
    }

    public getEnumValueI18n(enumValue: EnumValue): Record<string, EnumValueLocalization> {
        return mapValues(this.getAllLocalizationProviders(), (provider) =>
            provider.localizeEnumValue(enumValue),
        );
    }

    private getResolutionProviders(
        resolutionOrder: ReadonlyArray<string>,
    ): ReadonlyArray<LocalizationProvider> {
        return compact(
            resolutionOrder.map((providerName) => {
                switch (providerName) {
                    case I18N_GENERIC:
                        return new GenericLocalizationProvider();
                    default:
                        return this.languageLocalizationProvidersByLanguage.get(providerName);
                }
            }),
        );
    }

    /**
     * Returns all available localization providers.
     *
     * The derived languages "I18N_GENERIC" and "I18N_LOCALE" are not included.
     */
    private getAllLocalizationProviders(): Record<string, LocalizationProvider> {
        const filteredProviders = Array.from(
            this.languageLocalizationProvidersByLanguage.entries(),
        ).filter(([lang, _]) => lang !== I18N_GENERIC && lang !== I18N_LOCALE);
        return Object.fromEntries(filteredProviders);
    }
}

export class NamespaceLocalization {
    public readonly namespacePath: ReadonlyArray<string>;

    constructor(private readonly config: NamespaceLocalizationConfig) {
        this.namespacePath = config.namespacePath;
    }

    public getTypeLocalization(name: string): TypeLocalization | undefined {
        if (!this.config.types || !this.config.types[name]) {
            return undefined;
        }
        const type = this.config.types[name];
        return {
            label: type.label,
            labelPlural: type.labelPlural,
            hint: type.hint,
            loc: type.loc,
        };
    }

    public getFieldLocalization({
        typeName,
        fieldName,
    }: {
        typeName: string;
        fieldName: string;
    }): FieldLocalization | undefined {
        return this.getElementLocalization({
            typeName,
            elementName: fieldName,
            property: 'fields',
        });
    }

    public getEnumValueLocalization({
        typeName,
        enumValue,
    }: {
        typeName: string;
        enumValue: string;
    }): EnumValueLocalization | undefined {
        return this.getElementLocalization({
            typeName,
            elementName: enumValue,
            property: 'values',
        });
    }

    private getElementLocalization({
        typeName,
        elementName,
        property,
    }: {
        typeName: string;
        elementName: string;
        property: 'fields' | 'values';
    }): FieldLocalization | undefined {
        if (!this.config.types || !this.config.types[typeName]) {
            return undefined;
        }
        const typeConfig = this.config.types[typeName];

        let elementLocalizations: { [name: string]: LocalizationBaseConfig } | undefined =
            typeConfig[property];
        if (!elementLocalizations) {
            return undefined;
        }

        const element = elementLocalizations[elementName];
        if (!element) {
            return undefined;
        }

        return {
            hint: element.hint,
            label: element.label,
            loc: element.loc,
        };
    }

    /**
     * Gets a localization for a field name outside of a type declaration
     *
     * This should be used as fallback if no direct type-field localization is present
     */
    public getCommonFieldLocalization(name: string): FieldLocalization | undefined {
        if (!this.config.fields || !this.config.fields[name]) {
            return undefined;
        }
        const field = this.config.fields[name];
        return {
            hint: field.hint,
            label: field.label,
            loc: field.loc,
        };
    }

    get loc(): MessageLocation | undefined {
        return this.config.loc;
    }

    get types(): { [name: string]: TypeLocalizationConfig } | undefined {
        return this.config.types;
    }
}

export interface TypeLocalization extends LocalizationBaseConfig {
    readonly labelPlural?: string;
}

export interface FieldLocalization extends LocalizationBaseConfig {}

export interface EnumValueLocalization extends LocalizationBaseConfig {}

interface LocalizationProvider {
    localizeType(type: TypeBase): TypeLocalization;
    localizeField(field: Field): FieldLocalization;
    localizeEnumValue(enumValue: EnumValue): EnumValueLocalization;
}

class ModelLocalizationProvider implements LocalizationProvider {
    constructor(private namespaces: ReadonlyArray<NamespaceLocalization>) {}

    private getMatchingNamespaces(
        namespacePath: ReadonlyArray<string>,
    ): ReadonlyArray<NamespaceLocalization> {
        return this.namespaces
            .filter((set) => arrayStartsWith(namespacePath, set.namespacePath))
            .sort((lhs, rhs) => lhs.namespacePath.length - rhs.namespacePath.length);
    }

    validate(validationContext: ValidationContext, model: Model) {
        const groupedNamespaceLocalizations = groupArray(this.namespaces, (ns) =>
            ns.namespacePath.join('.'),
        );
        for (const namespaces of groupedNamespaceLocalizations.values()) {
            checkForDoubleDefinitions(namespaces, validationContext);
            checkForTypeConstraints(namespaces, model, validationContext);
        }
    }

    localizeType(type: TypeBase): TypeLocalization {
        const matchingNamespaces = this.getMatchingNamespaces(type.namespacePath);
        const matchingTypeLocalizations = compact(
            matchingNamespaces.map((ns) => ns.getTypeLocalization(type.name)),
        );
        return {
            label: mapFirstDefined(matchingTypeLocalizations, (t) => t.label),
            labelPlural: mapFirstDefined(matchingTypeLocalizations, (t) => t.labelPlural),
            hint: mapFirstDefined(matchingTypeLocalizations, (t) => t.hint),
        };
    }

    localizeField(field: Field): FieldLocalization {
        const matchingNamespaces = this.getMatchingNamespaces(field.declaringType.namespacePath);

        let label: string | undefined;
        let hint: string | undefined;

        // first, try to find a localization declared on the type
        for (const namespace of matchingNamespaces) {
            const typeField = namespace.getFieldLocalization({
                typeName: field.declaringType.name,
                fieldName: field.name,
            });
            if (typeField) {
                label = label ? label : typeField.label;
                hint = hint ? hint : typeField.hint;

                if (label && hint) {
                    break;
                }
            }
        }
        // fall back to global field localization
        for (const namespace of matchingNamespaces) {
            const typeField = namespace.getCommonFieldLocalization(field.name);
            if (typeField) {
                label = label ? label : typeField.label;
                hint = hint ? hint : typeField.hint;
            }
            if (label && hint) {
                break;
            }
        }
        return { label: label, hint: hint };
    }

    localizeEnumValue(enumValue: EnumValue): EnumValueLocalization {
        const matchingNamespaces = this.getMatchingNamespaces(
            enumValue.declaringType.namespacePath,
        );

        let label: string | undefined;
        let hint: string | undefined;

        for (const namespace of matchingNamespaces) {
            const localization = namespace.getEnumValueLocalization({
                typeName: enumValue.declaringType.name,
                enumValue: enumValue.value,
            });
            if (localization) {
                label = label ? label : localization.label;
                hint = hint ? hint : localization.hint;

                if (label && hint) {
                    break;
                }
            }
        }
        return { label: label, hint: hint };
    }
}

function checkForTypeConstraints(
    namespaces: ReadonlyArray<NamespaceLocalization>,
    model: Model,
    validationContext: ValidationContext,
) {
    for (const ns of namespaces) {
        if (ns.types) {
            for (const typeKey in ns.types) {
                const type = ns.types[typeKey];
                const modelType: TypeBase | undefined = model.getType(typeKey);

                if (!modelType) {
                    validationContext.addMessage(
                        ValidationMessage.nonSuppressableWarning(
                            'There is no type "' +
                                typeKey +
                                '" in the model specification. This might be a spelling error.',
                            type.loc,
                        ),
                    );
                    continue;
                }

                if (type.fields) {
                    try {
                        const objectType = model.getObjectTypeOrThrow(typeKey);
                        for (const field in type.fields) {
                            if (!objectType.fields.find((f) => f.name === field)) {
                                validationContext.addMessage(
                                    ValidationMessage.nonSuppressableWarning(
                                        'The type "' +
                                            typeKey +
                                            '" has no field "' +
                                            field +
                                            '". This might be a spelling error.',
                                        type.fields[field].loc,
                                    ),
                                );
                            }
                        }
                    } catch (e) {
                        validationContext.addMessage(
                            ValidationMessage.error(
                                'The type "' +
                                    typeKey +
                                    '" is a non-object-type. It does not have "fields" attribute. Did you mean to use "values" instead?',
                                type.loc,
                            ),
                        );
                    }
                } else if (type.values) {
                    const enumType = model.getEnumType(typeKey);
                    if (!enumType) {
                        validationContext.addMessage(
                            ValidationMessage.error(
                                'The type "' +
                                    typeKey +
                                    '" is not an enum type. It does not have "values" attribute. Did you mean to use "fields" instead?',
                                type.loc,
                            ),
                        );
                    } else {
                        if (type.values) {
                            for (const value in type.values) {
                                if (!enumType.values.find((v) => v.value === value)) {
                                    validationContext.addMessage(
                                        ValidationMessage.nonSuppressableWarning(
                                            'The enum type "' +
                                                typeKey +
                                                '" has no value "' +
                                                value +
                                                '". This might be a spelling error.',
                                            type.values[value].loc,
                                        ),
                                    );
                                }
                            }
                        }
                    }
                }
            }
        }
    }
}

function checkForDoubleDefinitions(
    namespaces: ReadonlyArray<NamespaceLocalization>,
    validationContext: ValidationContext,
) {
    const alreadySeen: string[] = [];

    for (const ns of namespaces) {
        if (ns.types) {
            for (const type in ns.types) {
                const typeConf = ns.types[type];
                if (typeConf.hint && isExistingAndAdd(type + '/hint', alreadySeen)) {
                    validationContext.addMessage(
                        ValidationMessage.error(
                            'The attribute "hint" in type "' +
                                type +
                                '" was defined several times in the i18n translation',
                            typeConf.loc,
                        ),
                    );
                }
                if (typeConf.label && isExistingAndAdd(type + '/label', alreadySeen)) {
                    validationContext.addMessage(
                        ValidationMessage.error(
                            'The attribute "label" in type "' +
                                type +
                                '" was defined several times in the i18n translation',
                            typeConf.loc,
                        ),
                    );
                }
                if (typeConf.labelPlural && isExistingAndAdd(type + '/labelPlural', alreadySeen)) {
                    validationContext.addMessage(
                        ValidationMessage.error(
                            'The attribute "labelPlural" in type "' +
                                type +
                                '" was defined several times in the i18n translation',
                            typeConf.loc,
                        ),
                    );
                }

                if (typeConf && typeConf.fields) {
                    for (const locBase in typeConf.fields) {
                        const fieldConf = typeConf.fields[locBase];
                        if (
                            fieldConf &&
                            fieldConf.label &&
                            isExistingAndAdd(type + '/' + locBase + '/label', alreadySeen)
                        ) {
                            validationContext.addMessage(
                                ValidationMessage.error(
                                    'The attribute "label" in field "' +
                                        locBase +
                                        '" of type "' +
                                        type +
                                        '" was defined several times in the i18n translation',
                                    fieldConf.loc,
                                ),
                            );
                        }
                        if (
                            fieldConf &&
                            fieldConf.hint &&
                            isExistingAndAdd(type + '/' + locBase + '/hint', alreadySeen)
                        ) {
                            validationContext.addMessage(
                                ValidationMessage.error(
                                    'The attribute "hint" in field "' +
                                        locBase +
                                        '" of type "' +
                                        type +
                                        '" was defined several times in the i18n translation',
                                    fieldConf.loc,
                                ),
                            );
                        }
                    }
                }
                if (typeConf && typeConf.values) {
                    for (const locBase in typeConf.values) {
                        const valueConf = typeConf.values[locBase];
                        if (
                            valueConf &&
                            valueConf.label &&
                            isExistingAndAdd(type + '/' + locBase + '/label', alreadySeen)
                        ) {
                            validationContext.addMessage(
                                ValidationMessage.error(
                                    'The attribute "label" in value "' +
                                        locBase +
                                        '" of type "' +
                                        type +
                                        '" was defined several times in the i18n translation',
                                    valueConf.loc,
                                ),
                            );
                        }
                        if (
                            valueConf &&
                            valueConf.hint &&
                            isExistingAndAdd(type + '/' + locBase + '/hint', alreadySeen)
                        ) {
                            validationContext.addMessage(
                                ValidationMessage.error(
                                    'The attribute "hint" in value "' +
                                        locBase +
                                        '" of type "' +
                                        type +
                                        '" was defined several times in the i18n translation',
                                    valueConf.loc,
                                ),
                            );
                        }
                    }
                }
            }
        }
    }
}

function isExistingAndAdd(search: string, array: string[]) {
    if (array.indexOf(search) >= 0) {
        array.push(search);
        return true;
    }
    array.push(search);
    return false;
}

class GenericLocalizationProvider implements LocalizationProvider {
    localizeField(field: Field): FieldLocalization {
        return {
            label: generateGenericName(field.name),
        };
    }

    localizeType(type: Type): TypeLocalization {
        return {
            label: generateGenericName(type.name),
            labelPlural: generateGenericName(type.pluralName),
        };
    }

    localizeEnumValue(enumValue: EnumValue): FieldLocalization {
        return {
            label: generateGenericName(enumValue.value),
        };
    }
}

function generateGenericName(name: string | undefined): string | undefined {
    if (name == undefined) {
        return undefined;
    }
    return capitalize(
        name.replace(/([a-z])([A-Z])/g, (str, arg1, arg2) => `${arg1} ${decapitalize(arg2)}`),
    );
}
