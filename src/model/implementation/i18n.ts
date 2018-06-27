import memorize from 'memorize-decorator';
import { arrayStartsWith, compact, flatMap, groupArray, mapFirstDefined, mapValues } from '../../utils/utils';
import { FieldI18nConfig, I18nConfig, NamespaceI18nConfig } from '../config/i18n';
import { ModelComponent, ValidationContext } from '../validation/validation-context';
import { Field } from './field';
import { ObjectTypeBase } from './object-type-base';
import { LOCALE_LANG } from '../../meta-schema/constants';

export class ModelI18n implements ModelComponent {

    readonly namespacesByCountry: ReadonlyMap<string, ReadonlyArray<I18nNamespace>>;

    constructor(input: ReadonlyArray<I18nConfig>) {
        // collect configs by language and create one list of namespaces per language
        // collect all countries for which namespaces must be created
        const configsByLanguage = groupArray(input, config => config.language);
        // const namespacesByCountryPrepared
        const namespacesByCountry = new Map<string, ReadonlyArray<I18nNamespace>>();
        Array.from(configsByLanguage.keys()).forEach(language =>
            namespacesByCountry.set(language, flatMap(configsByLanguage.get(language)!,
                config => flattenNamespaceConfigs(config.namespaceContent, config.namespacePath)
                    .map(flatNamespace => new I18nNamespace(flatNamespace))))
        );
        this.namespacesByCountry = namespacesByCountry;
    }

    public validate(context: ValidationContext): void {
    }

    protected getAvailableTypeLocalizations(type: ObjectTypeBase, languages: ReadonlyArray<string>): ReadonlyArray<TypeI18n> {
        const matchingNamespaces = this.getMatchingNamespaces(type.namespacePath, languages);
        return compact(matchingNamespaces.map(t => t.getAllLocalizationsForType(type.name)));
    }

    @memorize()
    public getTypeLocalization(type: ObjectTypeBase, resolutionOrder: ReadonlyArray<string>): TypeI18n {
        const availableTypeLocalizations = this.getAvailableTypeLocalizations(type, resolutionOrder);
        // try to build one complete type localization out of the available possibly partial localizations
        return new TypeI18n(
            type.name,
            mapFirstDefined(availableTypeLocalizations, t => t.singular),
            mapFirstDefined(availableTypeLocalizations, t => t.plural),
            mapFirstDefined(availableTypeLocalizations, t => t.hint)
        );
    }

    protected getAvailableFieldLocalizations(field: Field, resolutionOrder: ReadonlyArray<string>): ReadonlyArray<FieldI18n> {
        const matchingNamespaces = this.getMatchingNamespaces(field.declaringType.namespacePath, resolutionOrder);
        return flatMap(matchingNamespaces, t => t.getAllLocalizationsForField(field.name, field.declaringType.name));
    }

    @memorize()
    public getFieldLocalization(field: Field, resolutionOrder: ReadonlyArray<string>): FieldI18n {
        const availableFieldLocalizations = this.getAvailableFieldLocalizations(field, resolutionOrder);
        // try to build one complete field localization out of the available possibly partial localizations
        return new FieldI18n(
            field.name,
            mapFirstDefined(availableFieldLocalizations, f => f.label),
            mapFirstDefined(availableFieldLocalizations, f => f.hint),
            field.type.name
        );
    }

    /**
     * Get namespaces including parent ordered by language and namespace depth (deeper first)
     */
    private getMatchingNamespaces(namespacePath: ReadonlyArray<string>, languages: ReadonlyArray<string>): ReadonlyArray<I18nNamespace> {
        return flatMap(languages, lang => {
            const namespaces = this.namespacesByCountry.get(lang);
            if (!namespaces || namespaces.length === 0) {
                return [];
            }
            return namespaces.filter(set => arrayStartsWith(namespacePath, set.namespacePath))
                .sort((lhs, rhs) => lhs.namespacePath.length - rhs.namespacePath.length);
        });
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
                new FieldI18n(
                    fieldName,
                    input.fields[fieldName].label,
                    input.fields[fieldName].hint,
                    undefined
                )
            ),
            // Fields from types
            ...flatMap(Object.keys(input.types), typeName =>
                Object.keys(input.types[typeName].fields)
                    .map(fieldName =>
                        new FieldI18n(
                            fieldName,
                            input.types[typeName].fields[fieldName].label,
                            input.types[typeName].fields[fieldName].hint,
                            typeName
                        )
                    )
            )
        ];
    }

    private extractTypes(input: FlatNamespaceI18nConfig): ReadonlyArray<FieldI18n> {
        return Object.keys(input.types).map(typeName => new TypeI18n(
            typeName,
            input.types[typeName].singular,
            input.types[typeName].plural,
            input.types[typeName].hint
            )
        );
    }

}

export class TypeI18n {
    constructor(
        public readonly name: string,
        public readonly singular?: string,
        public readonly plural?: string,
        public readonly hint?: string) {
    }
}

export class FieldI18n {
    constructor(
        public readonly name: string,
        public readonly label?: string,
        public readonly hint?: string,
        public readonly type?: string) {
    }
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


