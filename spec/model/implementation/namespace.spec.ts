import { Namespace } from '../../../src/model/implementation/namespace';
import { Model, RootEntityType, TypeKind } from '../../../src/model';
import { expect } from 'chai';

const model = new Model({
    types: []
});

describe('Namespace', () => {
    describe('rootEntityTypes', () => {
        it('works for root namespace', () => {
            const types = ['Top1', 'Top2', 'a.A1', 'b.B1', 'b.inner.Inner'].map(createRootEntity);
            const namespace = new Namespace(undefined, [], types);
            expect(namespace.rootEntityTypes.map(t => t.name)).to.deep.equal(['Top1', 'Top2']);
        });

        it('works for first-level namespace', () => {
            const types = ['a.A1', 'a.A2', 'a.inner.Inner'].map(createRootEntity);
            const namespace = new Namespace(undefined, ['a'], types);
            expect(namespace.rootEntityTypes.map(t => t.name)).to.deep.equal(['A1', 'A2']);
        });

        it('works for second-level namespace', () => {
            const types = ['b.inner.Inner', 'b.inner.evendeeper.Test'].map(createRootEntity);
            const namespace = new Namespace(undefined, ['b', 'inner'], types);
            expect(namespace.rootEntityTypes.map(t => t.name)).to.deep.equal(['Inner']);
        });
    });

    describe('childNamespaces', () => {
        it('works for root namespace', () => {
            const types = ['Top1', 'Top2', 'a.A1', 'a.A2', 'b.B1', 'b.inner.Inner'].map(createRootEntity);
            const namespace = new Namespace(undefined, [], types);
            expect(namespace.childNamespaces.map(c => c.dotSeparatedPath)).to.deep.equal(['a', 'b']);
            expect(namespace.childNamespaces.map(c => c.rootEntityTypes.map(r => r.name))).to.deep.equal([
                ['A1', 'A2'], ['B1']
            ]);
        });

        it('works for first-level namespace', () => {
            const types = ['b.B1', 'b.inner.Inner', 'b.other.evendeeper.Test'].map(createRootEntity);
            const namespace = new Namespace(undefined, ['b'], types);
            expect(namespace.childNamespaces.map(c => c.dotSeparatedPath)).to.deep.equal(['b.inner', 'b.other']);
            expect(namespace.childNamespaces.map(c => c.rootEntityTypes.map(r => r.name))).to.deep.equal([
                ['Inner'], []
            ]);
        });

        it('works for second-level namespace', () => {
            const types = ['b.B1', 'b.inner.Inner', 'b.other.evendeeper.Test'].map(createRootEntity);
            const namespace = new Namespace(undefined, ['b', 'other'], types);
            expect(namespace.childNamespaces.map(c => c.dotSeparatedPath)).to.deep.equal(['b.other.evendeeper']);
            expect(namespace.childNamespaces.map(c => c.rootEntityTypes.map(r => r.name))).to.deep.equal([
                ['Test']
            ]);
        });
    });

    describe('descendantNamespaces', () => {
        it('includes all namespaces, even empty ones', () => {
            const types = [
                'Top1', 'Top2', 'a.A1', 'a.A2', 'b.B1', 'b.inner.Inner', 'c.inner.deep.Test'
            ].map(createRootEntity);
            const namespace = new Namespace(undefined, [], types);
            expect(namespace.descendantNamespaces.map(c => c.dotSeparatedPath)).to.deep.equal([
                'a', 'b', 'b.inner', 'c', 'c.inner', 'c.inner.deep'
            ]);
        });
    });

    describe('getChildNamespace', () => {
        it('works for root', () => {
            const types = ['Top1', 'Top2', 'a.A1', 'b.B1', 'b.inner.Inner'].map(createRootEntity);
            const namespace = new Namespace(undefined, [], types);
            const res = namespace.getChildNamespace('a');
            expect(res).not.to.be.undefined;
            expect(res!.dotSeparatedPath).to.equal('a');
        });

        it('returns undefined if not found', () => {
            const types = ['Top1', 'Top2', 'a.A1', 'b.B1', 'b.inner.Inner'].map(createRootEntity);
            const namespace = new Namespace(undefined, [], types);
            const res = namespace.getChildNamespace('notfound');
            expect(res).to.be.undefined;
        });
    });
});

function createRootEntity(fqn: string) {
    const namespacePath = fqn.split('.');
    const name = namespacePath.pop()!;
    return new RootEntityType({
        kind: TypeKind.ROOT_ENTITY,
        name,
        namespacePath,
        fields: []
    }, model);
}
