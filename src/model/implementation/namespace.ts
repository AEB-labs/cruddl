import { RootEntityType } from './root-entity-type';

export class Namespace {
    public readonly rootEntityTypes: ReadonlyArray<RootEntityType>;
    private readonly childNamespaceMap: ReadonlyMap<string, Namespace>;
    public readonly childNamespaces: ReadonlyArray<Namespace>;
    public readonly descendantNamespaces: ReadonlyArray<Namespace>;

    constructor(public readonly parent: Namespace | undefined, public readonly path: ReadonlyArray<string>, public allRootEntityTypes: ReadonlyArray<RootEntityType>) {
        // find the root entities that do not declare additional path segments
        this.rootEntityTypes = allRootEntityTypes.filter(type => this.extractNextSegment(type) == undefined);

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

    public get dotSeparatedPath() {
        return this.path.join('.');
    }

    public get name(): string|undefined {
        return this.path[0];
    }

    getChildNamespace(name: string): Namespace | undefined {
        return this.childNamespaceMap.get(name);
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
