import { ModelInput, TypeKind } from '../input';
import { ValidationResult } from '../validation';
import { createPermissionMap, PermissionProfile, PermissionProfileMap } from '../../authorization/permission-profile';
import { createType, InvalidType, Type } from './type';
import { Namespace } from './namespace';
import { ValidationContext } from './validation';
import { builtInTypes } from './built-in-types';
import { RootEntityType } from './root-entity-type';
import { ChildEntityType } from './child-entity-type';
import { EntityExtensionType } from './entity-extension-type';
import { ValueObjectType } from './value-object-type';
import { ScalarType } from './scalar-type';
import { EnumType } from './enum-type';

export class Model {
    private readonly typeMap: ReadonlyMap<string, Type>;

    readonly rootNamespace: Namespace;
    readonly namespaces: ReadonlyArray<Namespace>;
    readonly types: ReadonlyArray<Type>;
    readonly permissionProfiles: PermissionProfileMap;

    constructor(private input: ModelInput) {
        this.permissionProfiles = createPermissionMap(input.permissionProfiles);
        this.types = [
            ...builtInTypes,
            ...input.types.map(typeInput => createType(typeInput, this))
        ];
        this.rootNamespace = new Namespace(undefined, [], this.rootEntityTypes);
        this.namespaces = [this.rootNamespace, ...this.rootNamespace.descendantNamespaces];
        this.typeMap = new Map(this.types.map((type): [string, Type] => ([type.name, type])));
    }

    validate(): ValidationResult {
        const context = new ValidationContext();
        for (const type of this.types) {
            type.validate(context);
        }

        return new ValidationResult([
            ...this.input.validationMessages || [],
            ...context.validationMessages
        ]);
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
            throw new Error(`Expected type "${name}" to be a a ${kind}, but is ${type.kind}`)
        }
        return type as T;
    }
}
