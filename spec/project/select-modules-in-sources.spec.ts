import { expect } from 'chai';
import { DocumentNode } from 'graphql';
import gql from 'graphql-tag';
import { Project, ProjectSource } from '../../core-exports';
import { ModuleSelectionOptions } from '../../src/project/select-modules-in-sources';
import { expectToBeValid } from '../model/implementation/validation-utils';

describe('selectModulesInProjectSource', () => {
    describe('with removeModuleDeclarations = false (default)', () => {
        it('removes types and fields that are not selected', () => {
            const result = run(
                gql`
                    type OneAndTwo @rootEntity @modules(in: ["module1", "module2"]) {
                        all: String @modules(all: true)
                        two: String @modules(in: "module2")
                        extra1: String @modules(in: ["extra1", "module2 & extra2"])
                        extra2: String @modules(in: ["extra2"])
                        one: String @modules(in: "module1")
                    }

                    type Two @rootEntity @modules(in: ["module2", "module3"]) {
                        all: String @modules(all: true)
                        one: String @modules(in: ["module1"])
                    }

                    type Three @rootEntity @modules(in: ["module3"]) {
                        all: String @modules(all: true)
                        one: String @modules(in: ["module1"])
                    }
                `,
                ['module1', 'module2', 'extra1'],
            );
            expect(result).to.equal(`
                    type OneAndTwo @rootEntity @modules(in: ["module1", "module2"]) {
                        all: String @modules(all: true)
                        two: String @modules(in: ["module2"])
                        extra1: String @modules(in: ["extra1"])
                        
                        one: String @modules(in: ["module1"])
                    }

                    type Two @rootEntity @modules(in: ["module2"]) {
                        all: String @modules(all: true)
                        one: String @modules(in: ["module1"])
                    }

                    
                `);
        });

        it('keeps id: ID @key', () => {
            // special case because system fields are usually not specified in the source, but id: ID @key needs to stay
            const result = run(
                gql`
                    type Test @rootEntity @modules(in: ["module1", "module2"]) {
                        id: ID @key
                        field: String @modules(in: ["module1", "module2"])
                    }
                `,
                ['module1'],
            );
            expect(result).to.equal(`
                    type Test @rootEntity @modules(in: ["module1"]) {
                        id: ID @key
                        field: String @modules(in: ["module1"])
                    }
                `);
        });

        it('removes the non-selected modules from the modules.json', () => {
            const project = new Project({
                sources: [
                    new ProjectSource(
                        'modules.json',
                        JSON.stringify({
                            modules: ['module1', 'module2', 'module3', 'extra1', 'extra2'],
                            permissionProfiles: {},
                        }),
                    ),
                ],
                modelOptions: { withModuleDefinitions: true },
            });
            expectToBeValid(project);

            const result = project.withModuleSelection(['module1', 'module2']);
            expectToBeValid(result);
            expect(result.sources.length).to.equal(1);
            expect(result.sources[0].body).to.equal(`{
  "modules": [
    "module1",
    "module2"
  ],
  "permissionProfiles": {}
}`);
            expect(result.getModel().modules.map((m) => m.name)).to.deep.equal([
                'module1',
                'module2',
            ]);
        });

        it('works with includeAllFields: true', () => {
            const result = run(
                gql`
                    type Test @rootEntity @modules(in: "module1", includeAllFields: true) {
                        field: Test @reference(keyField: "keyField")
                        key: String @key
                        keyField: String
                    }
                `,
                ['module1'],
            );
            expect(result).to.equal(`
                    type Test @rootEntity @modules(includeAllFields: true, in: ["module1"]) {
                        field: Test @reference(keyField: "keyField")
                        key: String @key
                        keyField: String
                    }
                `);
        });

        it('keeps indices that are fully covered by the modules', () => {
            const result = run(
                gql`
                    type Test
                        @rootEntity(
                            indices: [
                                { fields: ["field1", "key"] }
                                { fields: ["field1", "children.field1"], sparse: true }
                            ]
                        )
                        @modules(in: "module1") {
                        key: String @key @modules(in: "module1")
                        field1: String @modules(in: "module1")
                        children: [Child] @modules(in: "module1")
                    }

                    type Child @childEntity @modules(in: "module1") {
                        field1: String @modules(in: "module1")
                        field2: String @modules(in: "module1")
                    }
                `,
                ['module1'],
            );
            expect(result).to.equal(`
                    type Test
                        @rootEntity(
                            indices: [
                                { fields: ["field1", "key"] }
                                { fields: ["field1", "children.field1"], sparse: true }
                            ]
                        )
                        @modules(in: ["module1"]) {
                        key: String @key @modules(in: ["module1"])
                        field1: String @modules(in: ["module1"])
                        children: [Child] @modules(in: ["module1"])
                    }

                    type Child @childEntity @modules(in: ["module1"]) {
                        field1: String @modules(in: ["module1"])
                        field2: String @modules(in: ["module1"])
                    }
                `);
        });

        it('removes indices where none of the specified fields are included in the selected modules', () => {
            const result = run(
                gql`
                    type Test
                        @rootEntity(
                            indices: [
                                { fields: ["field1", "key"] }
                                { fields: ["field2", "children.field2"], sparse: true }
                            ]
                        )
                        @modules(in: "module1") {
                        key: String @key @modules(in: "module1")
                        field1: String @modules(in: "module1")
                        field2: String @modules(in: "module2")
                        children: [Child] @modules(in: "module1")
                    }

                    type Child @childEntity @modules(in: "module1") {
                        field1: String @modules(in: "module1")
                        field2: String @modules(in: "module2")
                    }
                `,
                ['module1'],
            );
            expect(result).to.equal(`
                    type Test
                        @rootEntity(
                            indices: [
                                { fields: ["field1", "key"] }
                                
                            ]
                        )
                        @modules(in: ["module1"]) {
                        key: String @key @modules(in: ["module1"])
                        field1: String @modules(in: ["module1"])
                        
                        children: [Child] @modules(in: ["module1"])
                    }

                    type Child @childEntity @modules(in: ["module1"]) {
                        field1: String @modules(in: ["module1"])
                        
                    }
                `);
        });

        it('removes the whole indices arg if all indices have been removed', () => {
            const result = run(
                gql`
                    type Test
                        @rootEntity(
                            indices: [
                                { fields: ["field2"] }
                                { fields: ["field2", "children.field2"], sparse: true }
                            ]
                        )
                        @modules(in: "module1") {
                        key: String @key @modules(in: "module1")
                        field1: String @modules(in: "module1")
                        field2: String @modules(in: "module2")
                        children: [Child] @modules(in: "module1")
                    }

                    type Child @childEntity @modules(in: "module1") {
                        field1: String @modules(in: "module1")
                        field2: String @modules(in: "module2")
                    }
                `,
                ['module1'],
            );
            expect(result).to.equal(`
                    type Test
                        @rootEntity
                        @modules(in: ["module1"]) {
                        key: String @key @modules(in: ["module1"])
                        field1: String @modules(in: ["module1"])
                        
                        children: [Child] @modules(in: ["module1"])
                    }

                    type Child @childEntity @modules(in: ["module1"]) {
                        field1: String @modules(in: ["module1"])
                        
                    }
                `);
        });

        it('removes the whole indices arg if all indices have been removed (and there are other args)', () => {
            const result = run(
                gql`
                    type Test
                        @rootEntity(
                            flexSearch: true
                            indices: [
                                { fields: ["field2"] }
                                { fields: ["field2", "children.field2"], sparse: true }
                            ]
                        )
                        @modules(in: "module1") {
                        key: String @key @modules(in: "module1")
                        field1: String @modules(in: "module1")
                        field2: String @modules(in: "module2")
                        children: [Child] @modules(in: "module1")
                    }

                    type Child @childEntity @modules(in: "module1") {
                        field1: String @modules(in: "module1")
                        field2: String @modules(in: "module2")
                    }
                `,
                ['module1'],
            );
            expect(result).to.equal(`
                    type Test
                        @rootEntity(
                            flexSearch: true
                            
                        )
                        @modules(in: ["module1"]) {
                        key: String @key @modules(in: ["module1"])
                        field1: String @modules(in: ["module1"])
                        
                        children: [Child] @modules(in: ["module1"])
                    }

                    type Child @childEntity @modules(in: ["module1"]) {
                        field1: String @modules(in: ["module1"])
                        
                    }
                `);
        });

        it('trims down indices that are partially covered by the modules', () => {
            const result = run(
                gql`
                    type Test
                        @rootEntity(
                            indices: [
                                { fields: ["field1", "key"] }
                                {
                                    fields: ["field1", "children.field1", "children.field2"]
                                    sparse: true
                                }
                            ]
                        )
                        @modules(in: "module1") {
                        key: String @key @modules(in: "module1")
                        field1: String @modules(in: "module1")
                        children: [Child] @modules(in: "module1")
                    }

                    type Child @childEntity @modules(in: "module1") {
                        field1: String @modules(in: "module1")
                        field2: String @modules(in: "module2")
                    }
                `,
                ['module1'],
            );
            expect(result).to.equal(`
                    type Test
                        @rootEntity(
                            indices: [
                                { fields: ["field1", "key"] }
                                {
                                    fields: ["field1", "children.field1"]
                                    sparse: true
                                }
                            ]
                        )
                        @modules(in: ["module1"]) {
                        key: String @key @modules(in: ["module1"])
                        field1: String @modules(in: ["module1"])
                        children: [Child] @modules(in: ["module1"])
                    }

                    type Child @childEntity @modules(in: ["module1"]) {
                        field1: String @modules(in: ["module1"])
                        
                    }
                `);
        });
    });

    describe('with removeModuleDeclarations = true', () => {
        it('removes module directives in graphql files', () => {
            const result = run(
                gql`
                    type OneAndTwo @rootEntity @modules(in: ["module1", "module2"]) {
                        all: String @modules(all: true)
                        two: String @modules(in: ["module2"])
                        extra1: String @modules(in: ["extra1"])
                        extra2: String @modules(in: ["extra2"])
                    }

                    type Two @rootEntity @modules(in: ["module2"]) {
                        all: String @modules(all: true)
                        one: String @modules(in: ["module1"])
                    }

                    type Three @rootEntity @modules(in: ["module3"]) {
                        all: String @modules(all: true)
                        one: String @modules(in: ["module1"])
                    }
                `,
                ['module1', 'module2', 'extra1'],
                { removeModuleDeclarations: true },
            );
            expect(result).to.equal(`
                    type OneAndTwo @rootEntity  {
                        all: String 
                        two: String 
                        extra1: String 
                        
                    }

                    type Two @rootEntity  {
                        all: String 
                        one: String 
                    }

                    
                `);
        });

        it('removes modules.json', () => {
            const project = new Project({
                sources: [
                    new ProjectSource(
                        'modules.json',
                        JSON.stringify({
                            modules: ['module1', 'module2', 'module3', 'extra1', 'extra2'],
                        }),
                    ),
                ],
                modelOptions: { withModuleDefinitions: true },
            });
            expectToBeValid(project);

            const result = project.withModuleSelection(['module1', 'module2'], {
                removeModuleDeclarations: true,
            });
            expectToBeValid(result);
            expect(result.sources.length).to.equal(0);
            expect(result.getModel().modules).to.deep.equal([]);
        });

        it('removes files that become comment-only', () => {
            const project = new Project({
                sources: [
                    new ProjectSource(
                        'modules.json',
                        JSON.stringify({
                            modules: ['module1', 'module2', 'module3', 'extra1', 'extra2'],
                        }),
                    ),
                    gql`
                        # a comment in the keeper file
                        type Keeper @rootEntity @modules(in: "module1", includeAllFields: true) {
                            key: String @key
                        }
                    `.loc!.source,
                    gql`
                        # a comment in the discard file
                        type Discard @rootEntity @modules(in: "extra2", includeAllFields: true) {
                            key: String @key
                        }
                    `.loc!.source,
                    // will also remove this one because we're throwing away comment-only file when
                    // parsing a project. Documenting that behavior in this test case, but it's
                    // probably fine either way
                    {
                        name: 'empty.graphqls',
                        body: "# a file that's already comment-only",
                    },
                ],
                modelOptions: { withModuleDefinitions: true },
            });
            expectToBeValid(project);

            const result = project.withModuleSelection(['module1', 'module2'], {
                removeModuleDeclarations: true,
            });
            expectToBeValid(result);
            expect(result.sources.map((s) => s.body)).to.deep.equal([
                `
                        # a comment in the keeper file
                        type Keeper @rootEntity  {
                            key: String @key
                        }
                    `,
            ]);
        });

        it('removes the modules part in an object file with modules and something else', () => {
            const project = new Project({
                sources: [
                    new ProjectSource(
                        'modules.json',
                        JSON.stringify({
                            modules: ['module1', 'module2', 'module3', 'extra1', 'extra2'],
                            permissionProfiles: {},
                        }),
                    ),
                ],
                modelOptions: { withModuleDefinitions: true },
            });
            expectToBeValid(project);

            const result = project.withModuleSelection(['module1', 'module2'], {
                removeModuleDeclarations: true,
            });
            expectToBeValid(result);
            expect(result.sources.length).to.equal(1);
            expect(result.sources[0].body).to.equal(`{
  "permissionProfiles": {}
}`);
            expect(result.getModel().modules).to.deep.equal([]);
        });
    });
});

function run(
    doc: DocumentNode,
    selectedModules: ReadonlyArray<string>,
    options: ModuleSelectionOptions = {},
): string | undefined {
    if (!doc.loc) {
        throw new Error('missing doc.loc');
    }
    const project = new Project({
        sources: [
            new ProjectSource('test.graphql', doc.loc.source.body),
            new ProjectSource(
                'modules.json',
                JSON.stringify({ modules: ['module1', 'module2', 'module3', 'extra1', 'extra2'] }),
            ),
        ],
        modelOptions: { withModuleDefinitions: true },
    });
    expectToBeValid(project);

    const result = project.withModuleSelection(selectedModules, options);
    expectToBeValid(result);
    const graphqlSource = result.sources.find((s) => s.name === 'test.graphql');
    return graphqlSource?.body;
}
