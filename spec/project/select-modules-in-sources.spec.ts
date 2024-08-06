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
                        extra1: String @modules(in: ["extra1", "module2 && extra2"])
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
                        
                        one: String @modules(in: "module1")
                    }

                    type Two @rootEntity @modules(in: ["module2"]) {
                        all: String @modules(all: true)
                        one: String @modules(in: ["module1"])
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
