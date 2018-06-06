import { capitalize } from '../../utils/utils';
import { RootEntityType } from './root-entity-type';

export class Namespace {
    public readonly rootEntityTypes: ReadonlyArray<RootEntityType>;
    private readonly rootEntityTypeMap: Map<string, RootEntityType>;
    private readonly childNamespaceMap: ReadonlyMap<string, Namespace>;
    public readonly childNamespaces: ReadonlyArray<Namespace>;
    public readonly descendantNamespaces: ReadonlyArray<Namespace>;

    constructor(public readonly parent: Namespace | undefined, public readonly path: ReadonlyArray<string>, public allRootEntityTypes: ReadonlyArray<RootEntityType>) {
        // find the root entities that do not declare additional path segments
        this.rootEntityTypes = allRootEntityTypes.filter(type => this.extractNextSegment(type) == undefined);
        this.rootEntityTypeMap = new Map(this.rootEntityTypes.map((type): [string, RootEntityType] => [
            type.name, type
        ]));

        // now find all direct additional path segments
        const childNamespaceNames = new Set(allRootEntityTypes
            .map(t => this.extractNextSegment(t))
            .filter(name => name != undefined));
        const childNamespaceMap = new Map<string, Namespace>();
        for (const childName of childNamespaceNames.values()) {
            childNamespaceMap.set(childName, new Namespace(this, [
                ...path, childName
            ], this.getRootEntitiesOfSegment(childName)));
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

    getRootEntityType(name: string): RootEntityType | undefined {
        return this.rootEntityTypeMap.get(name);
    }

    getRootEntityTypeOrThrow(name: string): RootEntityType {
        const type = this.getRootEntityType(name);
        const namespaceDesc = this.isRoot ? `root namespace`: `namespace "${this.dotSeparatedPath}"`;
        if (!type) {
            throw new Error(`Expected root entity "${name}" to exist in ${namespaceDesc}`);
        }
        return type;
    }

    get isRoot(): boolean {
        return this.parent == undefined;
    }

    private extractNextSegment(rootEntity: RootEntityType) {
        return rootEntity.namespacePath[this.path.length];
    }

    private getRootEntitiesOfSegment(name: string) {
        return this.allRootEntityTypes.filter(type => this.extractNextSegment(type) === name);
    }
}
