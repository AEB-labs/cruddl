import { groupBy } from 'lodash';
import memorize from 'memorize-decorator';
import { DEFAULT_PERMISSION_PROFILE } from '../../schema/constants';
import { capitalize, objectValues } from '../../utils/utils';
import { ValidationMessage } from '../validation';
import { ModelComponent, ValidationContext } from '../validation/validation-context';
import { PermissionProfile } from './permission-profile';
import { RootEntityType } from './root-entity-type';
import { Type } from './type';

export class Namespace implements ModelComponent {
    public readonly types: ReadonlyArray<Type>;
    private readonly typeMap: Map<string, Type>;
    private readonly childNamespaceMap: ReadonlyMap<string, Namespace>;
    public readonly childNamespaces: ReadonlyArray<Namespace>;
    public readonly descendantNamespaces: ReadonlyArray<Namespace>;
    public allTypes: ReadonlyArray<Type>;
    public readonly path: ReadonlyArray<string>;
    public readonly parent: Namespace | undefined;
    public readonly permissionProfiles: ReadonlyArray<PermissionProfile>;

    constructor(config: { parent?: Namespace, path: ReadonlyArray<string>, allTypes: ReadonlyArray<Type>, allPermissionProfiles: ReadonlyArray<PermissionProfile> }) {
        this.allTypes = config.allTypes;
        this.path = config.path;
        this.parent = config.parent;
        this.permissionProfiles = config.allPermissionProfiles.filter(profile => this.pathEquals(profile.namespacePath));

        // find the root entities that do not declare additional path segments
        this.types = this.allTypes.filter(type => this.pathEquals(type.namespacePath));
        this.typeMap = new Map(this.types.map((type): [string, Type] => [
            type.name, type
        ]));

        // now find all direct additional path segments
        const allPaths = [
            ...this.allTypes.map(t => t.namespacePath), ...config.allPermissionProfiles.map(p => p.namespacePath)
        ];
        const childNamespaceNames = new Set(allPaths
            .map(path => path[this.path.length]) // extract next segment
            .filter(name => name != undefined));
        const childNamespaceMap = new Map<string, Namespace>();
        for (const childName of childNamespaceNames.values()) {
            childNamespaceMap.set(childName, new Namespace({
                parent: this,
                path: [...this.path, childName],
                allTypes: this.getTypesOfSegment(childName),
                allPermissionProfiles: config.allPermissionProfiles
            }));
        }
        this.childNamespaceMap = childNamespaceMap;
        this.childNamespaces = Array.from(this.childNamespaceMap.values());

        // recursively collect child namespaces, their child namespaces, and so on
        this.descendantNamespaces = ([] as ReadonlyArray<Namespace>).concat(...this.childNamespaces.map(n => [
            n,
            ...n.descendantNamespaces
        ]));
    }

    public get dotSeparatedPath(): string {
        return this.path.join('.');
    }

    public get pascalCasePath(): string {
        return this.path.map(segment => capitalize(segment)).join('');
    }

    public get name(): string | undefined {
        return this.path[this.path.length - 1];
    }

    getChildNamespace(name: string): Namespace | undefined {
        return this.childNamespaceMap.get(name);
    }

    getChildNamespaceOrThrow(name: string): Namespace {
        const namespace = this.getChildNamespace(name);
        if (!namespace) {
            throw new Error(`Expected namespace "${[...this.path, name].join('.')}" to exist`);
        }
        return namespace;
    }

    @memorize()
    get allRootEntityTypes(): ReadonlyArray<RootEntityType> {
        return this.allTypes.filter(t => t.isRootEntityType) as ReadonlyArray<RootEntityType>;
    }

    @memorize()
    get rootEntityTypes(): ReadonlyArray<RootEntityType> {
        return this.types.filter(t => t.isRootEntityType) as ReadonlyArray<RootEntityType>;
    }

    getType(name: string): Type | undefined {
        return this.typeMap.get(name);
    }

    getTypeOrThrow(name: string): Type {
        const type = this.getType(name);
        if (!type) {
            const namespaceDesc = this.isRoot ? `root namespace` : `namespace "${this.dotSeparatedPath}"`;
            throw new Error(`Expected type "${name}" to exist in ${namespaceDesc}`);
        }
        return type;
    }

    getRootEntityType(name: string): RootEntityType | undefined {
        const type = this.getType(name);
        if (!type || !type.isRootEntityType) {
            return undefined;
        }
        return type;
    }

    getRootEntityTypeOrThrow(name: string): RootEntityType {
        const type = this.getTypeOrThrow(name);
        if (!type.isRootEntityType) {
            throw new Error(`Expected type "${name}" to be a root entity type`);
        }
        return type;
    }

    get isRoot(): boolean {
        return this.parent == undefined;
    }

    private extractNextSegment(type: Type) {
        return type.namespacePath[this.path.length];
    }

    private getTypesOfSegment(name: string) {
        return this.allTypes.filter(type => this.extractNextSegment(type) === name);
    }

    get defaultPermissionProfile(): PermissionProfile | undefined {
        return this.getPermissionProfile(DEFAULT_PERMISSION_PROFILE);
    }

    private isSuperNamespace(path: ReadonlyArray<string>) {
        if (path.length > this.path.length) {
            return false;
        }
        for (let i = 0; i < path.length; i++) {
            if (this.path[i] !== path[i]) {
                return false;
            }
        }
        return true;
    }

    private pathEquals(path: ReadonlyArray<string>) {
        if (path.length !== this.path.length) {
            return false;
        }
        for (let i = 0; i < path.length; i++) {
            if (this.path[i] !== path[i]) {
                return false;
            }
        }
        return true;
    }

    @memorize()
    private get permissionProfileMap(): Map<string, PermissionProfile> {
        return new Map(this.permissionProfiles.map((profile): [string, PermissionProfile] => [profile.name, profile]));
    }

    getPermissionProfile(name: string): PermissionProfile | undefined {
        const profile = this.permissionProfileMap.get(name);
        if (profile) {
            return profile;
        }
        if (this.parent) {
            return this.parent.getPermissionProfile(name);
        }
        return undefined;
    }

    getPermissionProfileOrThrow(name: string): PermissionProfile {
        const profile = this.getPermissionProfile(name);
        if (profile == undefined) {
            throw new Error(`Permission profile "${name}" does not exist in namespace ${this.dotSeparatedPath}`);
        }
        return profile;
    }

    getAvailablePermissionProfiles() {
        const map = new Map<string, PermissionProfile>();
        let ns: Namespace | undefined = this;
        while (ns) {
            for (const profile of ns.permissionProfiles) {
                if (!map.has(profile.name)) {
                    map.set(profile.name, profile);
                }
            }
            ns = ns.parent;
        }
        return Array.from(map.values());
    }

    validate(context: ValidationContext) {
        const duplicateProfiles = objectValues(groupBy(this.permissionProfiles, type => type.name)).filter(types => types.length > 1);
        for (const profiles of duplicateProfiles) {
            for (const profile of profiles) {
                context.addMessage(ValidationMessage.error(`Duplicate permission profile name: "${profile.name}".`, profile.loc));
            }
        }
        // shadowing
        if (this.parent) {
            for (const profile of this.permissionProfiles) {
                if (profile.name !== DEFAULT_PERMISSION_PROFILE) {
                    const shadowed = this.parent.getPermissionProfile(profile.name);
                    if (shadowed) {
                        context.addMessage(ValidationMessage.warn(`Permission profile: "${profile.name}" shadows the profile in namespace "${shadowed.namespacePath.join('.')}" with the same name.`, profile.loc));
                    }
                }
            }
        }
    }
}
