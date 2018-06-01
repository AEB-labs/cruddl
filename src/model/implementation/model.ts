import { ModelConfig, TypeKind } from '../config';
import { ValidationMessage, ValidationResult } from '../validation';
import { createPermissionMap, PermissionProfile, PermissionProfileMap } from './permission-profile';
import { createType, InvalidType, ObjectType, Type } from './type';
import { Namespace } from './namespace';
import { ModelComponent, ValidationContext } from './validation';
import { builtInTypeNames, builtInTypes } from './built-in-types';
import { RootEntityType } from './root-entity-type';
import { ChildEntityType } from './child-entity-type';
import { EntityExtensionType } from './entity-extension-type';
import { ValueObjectType } from './value-object-type';
import { ScalarType } from './scalar-type';
import { EnumType } from './enum-type';
import { groupBy } from 'lodash';
import { flatMap, objectValues } from '../../utils/utils';
import { DEFAULT_PERMISSION_PROFILE } from '../../schema/schema-defaults';
import { Relation } from './relation';

export class Model implements ModelComponent{
    private readonly typeMap: ReadonlyMap<string, Type>;

    readonly rootNamespace: Namespace;
    readonly namespaces: ReadonlyArray<Namespace>;
    readonly types: ReadonlyArray<Type>;
    readonly permissionProfiles: PermissionProfileMap;

    constructor(private input: ModelConfig) {
        this.permissionProfiles = createPermissionMap(input.permissionProfiles);
        this.types = [
            ...builtInTypes,
            ...input.types.map(typeInput => createType(typeInput, this))
        ];
        this.rootNamespace = new Namespace(undefined, [], this.rootEntityTypes);
        this.namespaces = [this.rootNamespace, ...this.rootNamespace.descendantNamespaces];
        this.typeMap = new Map(this.types.map((type): [string, Type] => ([type.name, type])));
    }

    validate(context = new ValidationContext()): ValidationResult {
        this.validateDuplicateTypes(context);

        for (const type of this.types) {
            type.validate(context);
        }

        return new ValidationResult([
            ...this.input.validationMessages || [],
            ...context.validationMessages
        ]);
    }

    private validateDuplicateTypes(context: ValidationContext) {
        const duplicateTypes = objectValues(groupBy(this.types, type => type.name)).filter(types => types.length > 1);
        for (const types of duplicateTypes) {
            for (const type of types) {
                if (builtInTypes.includes(type)) {
                    // don't report errors for built-in types
                    continue;
                }

                if (builtInTypeNames.has(type.name)) {
                    // user does not see duplicate type, so provide better message
                    context.addMessage(ValidationMessage.error(`Type name "${type.name}" is reserved by a built-in type.`, undefined, type.astNode));
                } else {
                    context.addMessage(ValidationMessage.error(`Duplicate type name: "${type.name}".`, undefined, type.astNode));
                }
            }
        }
    }

    getType(name: string): Type | undefined {
        return this.typeMap.get(name);
    }

    getTypeOrFallback(name: string): Type {
        return this.typeMap.get(name) || new InvalidType(name);
    }

    getTypeOrThrow(name: string): Type {
        const type = this.typeMap.get(name);
        if (!type) {
            throw new Error(`Reference to undefined type "${name}"`);
        }
        return type;
    }

    getPermissionProfile(name: string): PermissionProfile | undefined {
        return this.permissionProfiles[name];
    }

    getPermissionProfileOrThrow(name: string): PermissionProfile {
        const profile = this.getPermissionProfile(name);
        if (profile == undefined) {
            throw new Error(`Permission profile "${name}" does not exist`);
        }
        return profile;
    }

    get defaultPermissionProfile(): PermissionProfile|undefined {
        return this.getPermissionProfile(DEFAULT_PERMISSION_PROFILE);
    }

    get rootEntityTypes(): ReadonlyArray<RootEntityType> {
        return this.types.filter(t => t.kind === TypeKind.ROOT_ENTITY) as ReadonlyArray<RootEntityType>;
    }

    get childEntityTypes(): ReadonlyArray<ChildEntityType> {
        return this.types.filter(t => t.kind === TypeKind.CHILD_ENTITY) as ReadonlyArray<ChildEntityType>;
    }

    get entityExtensionTypes(): ReadonlyArray<EntityExtensionType> {
        return this.types.filter(t => t.kind === TypeKind.ENTITY_EXTENSION) as ReadonlyArray<EntityExtensionType>;
    }

    get valueObjectTypes(): ReadonlyArray<ValueObjectType> {
        return this.types.filter(t => t.kind === TypeKind.VALUE_OBJECT) as ReadonlyArray<ValueObjectType>;
    }

    get scalarTypes(): ReadonlyArray<ScalarType> {
        return this.types.filter(t => t.kind === TypeKind.SCALAR) as ReadonlyArray<ScalarType>;
    }

    get enumTypes(): ReadonlyArray<EnumType> {
        return this.types.filter(t => t.kind === TypeKind.ENUM) as ReadonlyArray<EnumType>;
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

    getTypeOfKindOrThrow<T extends Type>(name: string, kind: TypeKind): T {
        const type = this.getTypeOrThrow(name);
        if (type.kind != kind) {
            throw new Error(`Expected type "${name}" to be a a ${kind}, but is ${type.kind}`);
        }
        return type as T;
    }

    getNamespaceByPath(path: ReadonlyArray<string>): Namespace | undefined {
        let curNamespace: Namespace | undefined = this.rootNamespace;
        for(const seg of path) {
            curNamespace = curNamespace.getChildNamespace(seg);
            if(!curNamespace){
                return undefined;
            }
        }
        return curNamespace;
    }

    getNamespaceByPathOrThrow(path: ReadonlyArray<string>): Namespace {
        const result = this.getNamespaceByPath(path);
        if(result == undefined) {
            throw new Error(`Namespace `+path.join('.')+` does not exist`);
        }
        return result;
    }

    get relations(): ReadonlyArray<Relation> {
        return flatMap(this.rootEntityTypes, entity => entity.relations);
    }
}
