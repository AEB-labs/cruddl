import { arrayStartsWith, compact, flatMap, groupArray } from '../../utils/utils';
import { TranslationConfig, TranslationNamespaceConfig, TypeTranslationConfig } from '../config/translation';
import { ModelComponent, ValidationContext } from '../validation/validation-context';
import { Field } from './field';
import { ObjectType } from './type';

export class Translations implements ModelComponent {

    readonly namespacesByCountry: ReadonlyMap<string, ReadonlyArray<TranslationNamespace>>;

    constructor(input: ReadonlyArray<TranslationConfig>) {
        // collect configs by language and create one list of namespaces per language
        // collect all countries for which namespaces must be created
        const configsByLanguage = groupArray(input, config => config.language);
        // const namespacesByCountryPrepared
        const namespacesByCountry = new Map<string, ReadonlyArray<TranslationNamespace>>();
        Array.from(configsByLanguage.keys()).forEach(language =>
            namespacesByCountry.set(language, flatMap(configsByLanguage.get(language)!,
                config => flattenNamespaceConfigs(config.localRoot, config.namespacePath)
                    .map(flatNamespace => new TranslationNamespace(flatNamespace))))
        );
        this.namespacesByCountry = namespacesByCountry;
    }

    public validate(context: ValidationContext): void {
    }

    protected getRawTypeTranslations(type: ObjectType, language: string): ReadonlyArray<TypeTranslation> {
        const translationSets = this.getMatchingNamespaces(type.namespacePath, language);
        return compact(translationSets.map(t => t.getTypeTranslation(type.name)));
    }

    public getTypeTranslation(type: ObjectType, language: string): TypeTranslation {
        const matchingTypeTranslations = this.getRawTypeTranslations(type, language);
        // try to build one complete type translation out of the available possibly partial translations
        return new TypeTranslation(
            type.name,
            matchingTypeTranslations.map(t => t.singular)[0],
            matchingTypeTranslations.map(t => t.plural)[0],
            matchingTypeTranslations.map(t => t.hint)[0]
        );
    }

    protected getRawFieldTranslations(field: Field, language: string): ReadonlyArray<FieldTranslation> {
        const namespaces = this.getMatchingNamespaces(field.declaringType.namespacePath, language);
        return flatMap(namespaces, t => t.getFieldTranslation(field.name, field.type.name));
    }

    public getFieldTranslation(field: Field, language: string): FieldTranslation|undefined {
        const matchingFieldTranslations = this.getRawFieldTranslations(field, language);
        // try to build one complete field translation out of the available possibly partial translations
        return new FieldTranslation(
            field.name,
            matchingFieldTranslations.map(t => t.label)[0],
            matchingFieldTranslations.map(t => t.hint)[0],
            field.type.name
        );

    }

    /**
     * Get namespaces including parent ordered by namespace depth
     * @param {ReadonlyArray<string>} namespacePath
     * @param {string} language
     * @returns {ReadonlyArray<TranslationNamespace>}
     */
    private getMatchingNamespaces(namespacePath: ReadonlyArray<string>, language: string): ReadonlyArray<TranslationNamespace> {
        if (this.namespacesByCountry.get(language)) {
            return [];
        }
        return this.namespacesByCountry.get(language)!.filter(set => arrayStartsWith(namespacePath, set.namespacePath))
            .sort((lhs, rhs) => lhs.namespacePath.length - rhs.namespacePath.length)
    }

}

export class TranslationNamespace {
    public readonly namespacePath: ReadonlyArray<string>;
    private readonly typeTranslations: ReadonlyArray<TypeTranslation>;
    private readonly fieldTranslations: ReadonlyArray<FieldTranslation>;
    constructor(input: FlatTranslationNamespaceConfig) {
        this.namespacePath = input.namespacePath;
        this.typeTranslations = this.extractTypes(input);
        this.fieldTranslations = this.extractFields(input);
    }

    public getTypeTranslation(name: string) {
        return this.typeTranslations.find(typeTrans => typeTrans.name === name);
    }

    public getFieldTranslation(name: string, type: string|undefined): ReadonlyArray<FieldTranslation> {
        return compact([
            this.fieldTranslations.find(fieldTrans => fieldTrans.name === name && fieldTrans.type === type),
            this.fieldTranslations.find(fieldTrans => fieldTrans.name === name && fieldTrans.type === undefined),
        ]);
    }

    private extractFields(input: FlatTranslationNamespaceConfig): ReadonlyArray<TypeTranslation> {
        return [
            // Namespace fields
            ...Object.keys(input.fields).map(fieldName =>
                new FieldTranslation(
                    fieldName,
                    input.fields[fieldName].label,
                    input.fields[fieldName].hint,
                    undefined
                )
            ),
            // Fields from types
            ...flatMap(Object.keys(input.definitions), typeName =>
                Object.keys(input.definitions[typeName].fields)
                    .map(fieldName =>
                        new FieldTranslation(
                            fieldName,
                            input.definitions[typeName].fields[fieldName].label,
                            input.definitions[typeName].fields[fieldName].hint,
                            typeName
                        )
                    )
            )
        ];
    }

    private extractTypes(input: FlatTranslationNamespaceConfig): ReadonlyArray<FieldTranslation> {
        return Object.keys(input.definitions).map(typeName => new TypeTranslation(
            typeName,
            input.definitions[typeName].singular,
            input.definitions[typeName].plural,
            input.definitions[typeName].hint
            )
        )
    }

}

export class TypeTranslation {
    constructor(
        public readonly name: string,
        public readonly singular?: string,
        public readonly plural?: string,
        public readonly hint?: string) {
    }
}

export class FieldTranslation {
    constructor(
        public readonly name: string,
        public readonly label?: string,
        public readonly hint?: string,
        public readonly type?: string) {
    }
}

function flattenNamespaceConfigs(namespace: TranslationNamespaceConfig, basePath: ReadonlyArray<string>): ReadonlyArray<FlatTranslationNamespaceConfig> {
    const definitions = {};
    const subNamespaces: FlatTranslationNamespaceConfig[] = [];
    Object.keys(namespace.definitions).forEach(key => {
        const child = namespace.definitions[key];
        if (child.kind === 'TranslationNamespaceConfig') {
            subNamespaces.push(
                ...flattenNamespaceConfigs({ ...child }, [...basePath, key])
            )
        }
    });
    const flattenedNamespace: FlatTranslationNamespaceConfig = {
        ...namespace,
        definitions,
        namespacePath: basePath
    };
    return [flattenedNamespace, ...subNamespaces];
}

/**
 * A namespace which does not have sub-namespaces
 */
export interface FlatTranslationNamespaceConfig extends TranslationNamespaceConfig {
    readonly namespacePath: ReadonlyArray<string>
    readonly definitions: { [name: string]: TypeTranslationConfig }
}