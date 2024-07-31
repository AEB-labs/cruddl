import { groupBy, uniqBy } from 'lodash';
import memorize from 'memorize-decorator';
import { ModelOptions } from '../../config/interfaces';
import { flatMap, objectEntries, objectValues } from '../../utils/utils';
import { ModelConfig, TypeKind } from '../config';
import { NamespacedPermissionProfileConfigMap } from '../index';
import { ValidationMessage, ValidationResult } from '../validation';
import { ModelComponent, ValidationContext } from '../validation/validation-context';
import { BillingEntityType } from './billing';
import { builtInTypeNames, createBuiltInTypes } from './built-in-types';
import { ChildEntityType } from './child-entity-type';
import { EntityExtensionType } from './entity-extension-type';
import { EnumType } from './enum-type';
import { ModelI18n } from './i18n';
import { Namespace } from './namespace';
import { PermissionProfile } from './permission-profile';
import { Relation } from './relation';
import { RootEntityType } from './root-entity-type';
import { ScalarType } from './scalar-type';
import { TimeToLiveType } from './time-to-live';
import { createType, InvalidType, ObjectType, Type } from './type';
import { ValueObjectType } from './value-object-type';
import { ModuleDeclaration } from './modules/module-declaration';

export class Model implements ModelComponent {
    private readonly typeMap: ReadonlyMap<string, Type>;
    private readonly builtInTypes: ReadonlyArray<Type>;

    readonly rootNamespace: Namespace;
    readonly namespaces: ReadonlyArray<Namespace>;
    readonly types: ReadonlyArray<Type>;
    readonly i18n: ModelI18n;
    readonly permissionProfiles: ReadonlyArray<PermissionProfile>;
    readonly billingEntityTypes: ReadonlyArray<BillingEntityType>;
    /**
     * @deprecated use options
     */
    readonly modelValidationOptions?: ModelOptions;
    readonly options?: ModelOptions;
    readonly timeToLiveTypes: ReadonlyArray<TimeToLiveType>;
    readonly modules: ReadonlyArray<ModuleDeclaration>;

    constructor(private input: ModelConfig) {
        this.modules = input.modules ? input.modules.map((m) => new ModuleDeclaration(m)) : [];
        // do this after the modules have been set because it uses the module list to make built-in types available in all modules
        this.builtInTypes = createBuiltInTypes(this);
        this.types = [
            ...this.builtInTypes,
            ...input.types.map((typeInput) => createType(typeInput, this)),
        ];
        this.permissionProfiles = flatMap(input.permissionProfiles || [], createPermissionProfiles);
        this.rootNamespace = new Namespace({
            parent: undefined,
            path: [],
            allTypes: this.types,
            allPermissionProfiles: this.permissionProfiles,
        });
        this.namespaces = [this.rootNamespace, ...this.rootNamespace.descendantNamespaces];
        this.typeMap = new Map(this.types.map((type): [string, Type] => [type.name, type]));
        this.i18n = new ModelI18n(input.i18n || [], this);
        this.billingEntityTypes = input.billing
            ? input.billing.billingEntities.map((value) => new BillingEntityType(value, this))
            : [];
        this.options = input.options;
        this.modelValidationOptions = input.options;
        this.timeToLiveTypes = input.timeToLiveConfigs
            ? input.timeToLiveConfigs.map((ttlConfig) => new TimeToLiveType(ttlConfig, this))
            : [];
    }

    validate(context = new ValidationContext()): ValidationResult {
        if (this.input.validationMessages) {
            for (const message of this.input.validationMessages) {
                context.addMessage(message);
            }
        }

        this.validateDuplicateTypes(context);

        this.i18n.validate(context);

        for (let billingEntityType of this.billingEntityTypes) {
            billingEntityType.validate(context);
        }

        for (const type of this.types) {
            type.validate(context);
        }

        for (const timeToLiveType of this.timeToLiveTypes) {
            timeToLiveType.validate(context);
        }

        for (const permissionProfile of this.permissionProfiles) {
            permissionProfile.validate(context);
        }

        this.validateDuplicateModules(context);

        return context.asResult();
    }

    private validateDuplicateTypes(context: ValidationContext) {
        const duplicateTypes = objectValues(groupBy(this.types, (type) => type.name)).filter(
            (types) => types.length > 1,
        );
        for (const types of duplicateTypes) {
            for (const type of types) {
                if (this.builtInTypes.includes(type)) {
                    // don't report errors for built-in types
                    continue;
                }

                if (builtInTypeNames.has(type.name)) {
                    // user does not see duplicate type, so provide better message
                    context.addMessage(
                        ValidationMessage.error(
                            `Type name "${type.name}" is reserved by a built-in type.`,
                            type.nameASTNode,
                        ),
                    );
                } else {
                    context.addMessage(
                        ValidationMessage.error(
                            `Duplicate type name: "${type.name}".`,
                            type.nameASTNode,
                        ),
                    );
                }
            }
        }
    }

    private validateDuplicateModules(context: ValidationContext) {
        const duplicateModules = objectValues(groupBy(this.modules, (type) => type.name)).filter(
            (types) => types.length > 1,
        );
        for (const modules of duplicateModules) {
            for (const module of modules) {
                context.addMessage(
                    ValidationMessage.error(
                        `Duplicate module declaration: "${module.name}".`,
                        module.loc,
                    ),
                );
            }
        }
    }

    getType(name: string): Type | undefined {
        return this.typeMap.get(name);
    }

    getTypeOrFallback(name: string): Type {
        return this.typeMap.get(name) || new InvalidType(name, this);
    }

    getTypeOrThrow(name: string): Type {
        const type = this.typeMap.get(name);
        if (!type) {
            throw new Error(`Reference to undefined type "${name}"`);
        }
        return type;
    }

    get rootEntityTypes(): ReadonlyArray<RootEntityType> {
        return this.types.filter(
            (t) => t.kind === TypeKind.ROOT_ENTITY,
        ) as ReadonlyArray<RootEntityType>;
    }

    get childEntityTypes(): ReadonlyArray<ChildEntityType> {
        return this.types.filter(
            (t) => t.kind === TypeKind.CHILD_ENTITY,
        ) as ReadonlyArray<ChildEntityType>;
    }

    get entityExtensionTypes(): ReadonlyArray<EntityExtensionType> {
        return this.types.filter(
            (t) => t.kind === TypeKind.ENTITY_EXTENSION,
        ) as ReadonlyArray<EntityExtensionType>;
    }

    get valueObjectTypes(): ReadonlyArray<ValueObjectType> {
        return this.types.filter(
            (t) => t.kind === TypeKind.VALUE_OBJECT,
        ) as ReadonlyArray<ValueObjectType>;
    }

    get scalarTypes(): ReadonlyArray<ScalarType> {
        return this.types.filter((t) => t.kind === TypeKind.SCALAR) as ReadonlyArray<ScalarType>;
    }

    get enumTypes(): ReadonlyArray<EnumType> {
        return this.types.filter((t) => t.kind === TypeKind.ENUM) as ReadonlyArray<EnumType>;
    }

    getObjectTypeOrThrow(name: string): ObjectType {
        const type = this.getTypeOrThrow(name);
        if (!type.isObjectType) {
            throw new Error(`Expected type "${name}" to be an object type, but is ${type.kind}`);
        }
        return type;
    }

    getRootEntityTypeOrThrow(name: string): RootEntityType {
        return this.getTypeOfKindOrThrow(name, TypeKind.ROOT_ENTITY);
    }

    getChildEntityTypeOrThrow(name: string): ChildEntityType {
        return this.getTypeOfKindOrThrow(name, TypeKind.CHILD_ENTITY);
    }

    getValueObjectTypeOrThrow(name: string): ValueObjectType {
        return this.getTypeOfKindOrThrow(name, TypeKind.VALUE_OBJECT);
    }

    getEntityExtensionTypeOrThrow(name: string): EntityExtensionType {
        return this.getTypeOfKindOrThrow(name, TypeKind.ENTITY_EXTENSION);
    }

    getScalarTypeOrThrow(name: string): ScalarType {
        return this.getTypeOfKindOrThrow(name, TypeKind.SCALAR);
    }

    getEnumTypeOrThrow(name: string): EnumType {
        return this.getTypeOfKindOrThrow(name, TypeKind.ENUM);
    }

    getRootEntityType(name: string): RootEntityType | undefined {
        return this.getTypeOfKind(name, TypeKind.ROOT_ENTITY);
    }

    getChildEntityType(name: string): ChildEntityType | undefined {
        return this.getTypeOfKind(name, TypeKind.CHILD_ENTITY);
    }

    getValueObjectType(name: string): ValueObjectType | undefined {
        return this.getTypeOfKind(name, TypeKind.VALUE_OBJECT);
    }

    getEntityExtensionType(name: string): EntityExtensionType | undefined {
        return this.getTypeOfKind(name, TypeKind.ENTITY_EXTENSION);
    }

    getScalarType(name: string): ScalarType | undefined {
        return this.getTypeOfKind(name, TypeKind.SCALAR);
    }

    getEnumType(name: string): EnumType | undefined {
        return this.getTypeOfKind(name, TypeKind.ENUM);
    }

    getTypeOfKindOrThrow<T extends Type>(name: string, kind: TypeKind): T {
        const type = this.getTypeOrThrow(name);
        if (type.kind != kind) {
            throw new Error(`Expected type "${name}" to be a a ${kind}, but is ${type.kind}`);
        }
        return type as T;
    }

    getTypeOfKind<T extends Type>(name: string, kind: TypeKind): T | undefined {
        const type = this.getType(name);
        if (!type || type.kind != kind) {
            return undefined;
        }
        return type as T;
    }

    getNamespaceByPath(path: ReadonlyArray<string>): Namespace | undefined {
        let curNamespace: Namespace | undefined = this.rootNamespace;
        for (const seg of path) {
            curNamespace = curNamespace.getChildNamespace(seg);
            if (!curNamespace) {
                return undefined;
            }
        }
        return curNamespace;
    }

    getNamespaceByPathOrThrow(path: ReadonlyArray<string>): Namespace {
        const result = this.getNamespaceByPath(path);
        if (result == undefined) {
            throw new Error(`Namespace ` + path.join('.') + ` does not exist`);
        }
        return result;
    }

    /**
     * Gets a list of all relations between any
     */
    @memorize()
    get relations(): ReadonlyArray<Relation> {
        const withDuplicates = flatMap(this.rootEntityTypes, (entity) => entity.explicitRelations);
        return uniqBy(withDuplicates, (rel) => rel.identifier);
    }

    get forbiddenRootEntityNames(): ReadonlyArray<string> {
        if (!this.options || !this.options.forbiddenRootEntityNames) {
            return ['BillingEntity'];
        }
        return this.options!.forbiddenRootEntityNames;
    }
}

function createPermissionProfiles(
    map: NamespacedPermissionProfileConfigMap,
): ReadonlyArray<PermissionProfile> {
    return objectEntries(map.profiles).map(
        ([name, profile]) => new PermissionProfile(name, map.namespacePath || [], profile),
    );
}
