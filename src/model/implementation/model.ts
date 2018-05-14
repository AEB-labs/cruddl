import { ModelInput } from '../input';
import { ValidationResult } from '../validation';
import { createPermissionMap, PermissionProfile, PermissionProfileMap } from '../../authorization/permission-profile';
import { createType, InvalidType, Type } from './type';
import { Namespace } from './namespace';
import { ValidationContext } from './validation';
import { builtInTypes } from './built-in-types';

export class Model {
    private readonly typeMap: ReadonlyMap<string, Type>;

    readonly rootNamespace: Namespace;
    readonly types: ReadonlyArray<Type>;
    readonly permissionProfiles: PermissionProfileMap;

    constructor(private input: ModelInput) {
        this.permissionProfiles = createPermissionMap(input.permissionProfiles);
        this.types = [
            ...builtInTypes,
            ...input.types.map(typeInput => createType(typeInput, this))
        ];
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

    getType(name: string): Type|undefined {
        return this.typeMap.get(name);
    }

    getTypeOrFallback(name: string): Type {
        return this.typeMap.get(name) || new InvalidType(name);
    }

    getTypeOrThrow(name: string): Type {
        const type = this.typeMap.get(name);
        if (!type) {
            throw new Error(`Reference to undefined type ${name}`);
        }
        return type;
    }

    getPermissionProfile(name: string): PermissionProfile|undefined {
        return this.permissionProfiles[name];
    }
}
