import { expect } from 'chai';
import { Model, Namespace, PermissionProfile, RootEntityType, TypeKind } from '../../../src/model';
import { expectSingleWarningToInclude, expectToBeValid, validate } from './validation-utils';

const model = new Model({
    types: [],
});

describe('Namespace', () => {
    describe('rootEntityTypes', () => {
        it('works for root namespace', () => {
            const types = ['Top1', 'Top2', 'a.A1', 'b.B1', 'b.inner.Inner'].map(createRootEntity);
            const namespace = new Namespace({
                path: [],
                allTypes: types,
                allPermissionProfiles: [],
            });
            expect(namespace.rootEntityTypes.map((t) => t.name)).to.deep.equal(['Top1', 'Top2']);
        });

        it('works for first-level namespace', () => {
            const types = ['a.A1', 'a.A2', 'a.inner.Inner'].map(createRootEntity);
            const namespace = new Namespace({
                path: ['a'],
                allTypes: types,
                allPermissionProfiles: [],
            });
            expect(namespace.rootEntityTypes.map((t) => t.name)).to.deep.equal(['A1', 'A2']);
        });

        it('works for second-level namespace', () => {
            const types = ['b.inner.Inner', 'b.inner.evendeeper.Test'].map(createRootEntity);
            const namespace = new Namespace({
                path: ['b', 'inner'],
                allTypes: types,
                allPermissionProfiles: [],
            });
            expect(namespace.rootEntityTypes.map((t) => t.name)).to.deep.equal(['Inner']);
        });
    });

    describe('childNamespaces', () => {
        it('works for root namespace', () => {
            const types = ['Top1', 'Top2', 'a.A1', 'a.A2', 'b.B1', 'b.inner.Inner'].map(
                createRootEntity,
            );
            const namespace = new Namespace({
                path: [],
                allTypes: types,
                allPermissionProfiles: [],
            });
            expect(namespace.childNamespaces.map((c) => c.dotSeparatedPath)).to.deep.equal([
                'a',
                'b',
            ]);
            expect(
                namespace.childNamespaces.map((c) => c.rootEntityTypes.map((r) => r.name)),
            ).to.deep.equal([['A1', 'A2'], ['B1']]);
        });

        it('works for first-level namespace', () => {
            const types = ['b.B1', 'b.inner.Inner', 'b.other.evendeeper.Test'].map(
                createRootEntity,
            );
            const namespace = new Namespace({
                path: ['b'],
                allTypes: types,
                allPermissionProfiles: [],
            });
            expect(namespace.childNamespaces.map((c) => c.dotSeparatedPath)).to.deep.equal([
                'b.inner',
                'b.other',
            ]);
            expect(
                namespace.childNamespaces.map((c) => c.rootEntityTypes.map((r) => r.name)),
            ).to.deep.equal([['Inner'], []]);
        });

        it('works for second-level namespace', () => {
            const types = ['b.B1', 'b.inner.Inner', 'b.other.evendeeper.Test'].map(
                createRootEntity,
            );
            const namespace = new Namespace({
                path: ['b', 'other'],
                allTypes: types,
                allPermissionProfiles: [],
            });
            expect(namespace.childNamespaces.map((c) => c.dotSeparatedPath)).to.deep.equal([
                'b.other.evendeeper',
            ]);
            expect(
                namespace.childNamespaces.map((c) => c.rootEntityTypes.map((r) => r.name)),
            ).to.deep.equal([['Test']]);
        });
    });

    describe('descendantNamespaces', () => {
        it('includes all namespaces, even empty ones', () => {
            const types = [
                'Top1',
                'Top2',
                'a.A1',
                'a.A2',
                'b.B1',
                'b.inner.Inner',
                'c.inner.deep.Test',
            ].map(createRootEntity);
            const namespace = new Namespace({
                path: [],
                allTypes: types,
                allPermissionProfiles: [],
            });
            expect(namespace.descendantNamespaces.map((c) => c.dotSeparatedPath)).to.deep.equal([
                'a',
                'b',
                'b.inner',
                'c',
                'c.inner',
                'c.inner.deep',
            ]);
        });
    });

    describe('getChildNamespace', () => {
        it('works for root', () => {
            const types = ['Top1', 'Top2', 'a.A1', 'b.B1', 'b.inner.Inner'].map(createRootEntity);
            const namespace = new Namespace({
                path: [],
                allTypes: types,
                allPermissionProfiles: [],
            });
            const res = namespace.getChildNamespace('a');
            expect(res).not.to.be.undefined;
            expect(res!.dotSeparatedPath).to.equal('a');
        });

        it('returns undefined if not found', () => {
            const types = ['Top1', 'Top2', 'a.A1', 'b.B1', 'b.inner.Inner'].map(createRootEntity);
            const namespace = new Namespace({
                path: [],
                allTypes: types,
                allPermissionProfiles: [],
            });
            const res = namespace.getChildNamespace('notfound');
            expect(res).to.be.undefined;
        });
    });

    describe('permission profiles', () => {
        describe('validate', () => {
            it('accepts multiple permission profiles', () => {
                const namespace = new Namespace({
                    path: [],
                    allTypes: [],
                    allPermissionProfiles: [
                        new PermissionProfile('test1', [], { permissions: [] }),
                        new PermissionProfile('test2', [], { permissions: [] }),
                    ],
                });
                expectToBeValid(namespace);
            });

            it('rejects duplicate permission profiles', () => {
                const namespace = new Namespace({
                    path: [],
                    allTypes: [],
                    allPermissionProfiles: [
                        new PermissionProfile('test', [], { permissions: [] }),
                        new PermissionProfile('test', [], { permissions: [] }),
                    ],
                });
                const result = validate(namespace);
                expect(result.hasErrors()).to.be.true;
                expect(result.messages).to.have.lengthOf(2);
                expect(result.messages.map((m) => m.message)).to.deep.equal([
                    'Duplicate permission profile name: "test".',
                    'Duplicate permission profile name: "test".',
                ]);
            });

            it('accepts duplicate permission profiles in child namespaces', () => {
                const namespace = new Namespace({
                    path: [],
                    allTypes: [],
                    allPermissionProfiles: [
                        new PermissionProfile('test1', ['sub'], { permissions: [] }),
                        new PermissionProfile('test2', ['sub'], { permissions: [] }),
                    ],
                });
                expectToBeValid(namespace);
            });

            it('warns about shadowed namespaces', () => {
                const parent = new Namespace({
                    path: [],
                    allTypes: [],
                    allPermissionProfiles: [
                        new PermissionProfile('test', [], { permissions: [] }),
                        new PermissionProfile('test', ['sub'], { permissions: [] }),
                    ],
                });
                const sub = parent.getChildNamespaceOrThrow('sub');
                expectSingleWarningToInclude(sub, `shadow`);
            });

            it('does not warn about shadowed default namespaces with', () => {
                const parent = new Namespace({
                    path: [],
                    allTypes: [],
                    allPermissionProfiles: [
                        new PermissionProfile('default', [], { permissions: [] }),
                        new PermissionProfile('default', ['sub'], { permissions: [] }),
                    ],
                });
                expectToBeValid(parent.getChildNamespaceOrThrow('sub'));
            });
        });

        describe('getPermissionProfile()', () => {
            const outer = new PermissionProfile('outer', [], { permissions: [] });
            const inner = new PermissionProfile('inner', ['sub'], { permissions: [] });
            const innersubsub = new PermissionProfile('inner', ['sub', 'subsub'], {
                permissions: [],
            });
            const parent = new Namespace({
                path: [],
                allTypes: [],
                allPermissionProfiles: [outer, inner, innersubsub],
            });
            const sub = parent.getChildNamespaceOrThrow('sub');
            const subsub = sub.getChildNamespaceOrThrow('subsub');

            it('returns profiles within its own namespace', () => {
                expect(sub.getPermissionProfile('inner')).to.equal(inner);
            });

            it('returns profiles of its parent namespace', () => {
                expect(sub.getPermissionProfile('outer')).to.equal(outer);
            });

            it('prefers its own profiles over those of its parent namespace', () => {
                expect(subsub.getPermissionProfile('inner')).to.equal(innersubsub);
            });

            it('does not find profiles of its child namespaces', () => {
                expect(parent.getPermissionProfile('inner')).to.be.undefined;
            });
        });
    });
});

function createRootEntity(fqn: string) {
    const namespacePath = fqn.split('.');
    const name = namespacePath.pop()!;
    return new RootEntityType(
        {
            kind: TypeKind.ROOT_ENTITY,
            name,
            namespacePath,
            fields: [],
        },
        model,
    );
}
