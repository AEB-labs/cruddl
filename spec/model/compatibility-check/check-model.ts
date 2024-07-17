import { DocumentNode, print } from 'graphql';
import gql from 'graphql-tag';
import { ModuleSelectionOptions } from '../../../src/project/select-modules-in-sources';
import {
    expectSingleCompatibilityIssue,
    expectToBeValid,
} from '../implementation/validation-utils';
import { ValidationResult } from '../../../src/model/validation/result';
import { Project } from '../../../src/project/project';
import { ProjectSource } from '../../../src/project/source';

describe('checkModel', () => {
    it('accepts a simple case', () => {
        const result = run(
            gql`
                type Test @rootEntity @modules(in: "module1") {
                    field: String @modules(all: true)
                }
            `,
            gql`
                type Test @rootEntity {
                    field: String
                }
            `,
            ['module1'],
        );
        expectToBeValid(result);
    });

    it('rejects if a type is missing', () => {
        const result = run(
            gql`
                type Test @rootEntity @modules(in: "module1") {
                    field: String @modules(all: true)
                }
            `,
            gql`
                type WrongTypeName @rootEntity {
                    field: String
                }
            `,
            ['module1'],
        );
        expectSingleCompatibilityIssue(
            result,
            'Type "Test" is missing (required by module "module1").',
        );
    });

    it('rejects if a type is of a completely wrong kind', () => {
        const result = run(
            gql`
                type Test @rootEntity @modules(in: "module1") {
                    field: String @modules(all: true)
                }
            `,
            gql`
                enum Test {
                    VALUE1
                    VALUE2
                }
            `,
            ['module1'],
        );
        expectSingleCompatibilityIssue(
            result,
            'Type "Test" needs to be a root entity type (required by module "module1").',
        );
    });

    it('rejects if a field is missing', () => {
        const result = run(
            gql`
                type Test @rootEntity @modules(in: "module1") {
                    field: String @modules(all: true)
                }
            `,
            gql`
                type Test @rootEntity {
                    wrongFieldName: String
                }
            `,
            ['module1'],
        );
        expectSingleCompatibilityIssue(
            result,
            'Field "Test.field" is missing (required by module "module1").',
        );
    });

    it('rejects if a field has the wrong type', () => {
        const result = run(
            gql`
                type Test @rootEntity @modules(in: "module1") {
                    field: String @modules(all: true)
                }
            `,
            gql`
                type Test @rootEntity {
                    field: Int
                }
            `,
            ['module1'],
        );
        expectSingleCompatibilityIssue(
            result,
            'Field "Test.field" needs to be of type "String" (required by module "module1").',
        );
    });

    it('rejects if a field should be a list', () => {
        const result = run(
            gql`
                type Test @rootEntity @modules(in: "module1") {
                    field: [String] @modules(all: true)
                }
            `,
            gql`
                type Test @rootEntity {
                    field: String
                }
            `,
            ['module1'],
        );
        expectSingleCompatibilityIssue(
            result,
            'Field "Test.field" needs to be a list (required by module "module1").',
        );
    });

    it('rejects if a field wrongly is a list', () => {
        const result = run(
            gql`
                type Test @rootEntity @modules(in: "module1") {
                    field: String @modules(all: true)
                }
            `,
            gql`
                type Test @rootEntity {
                    field: [String]
                }
            `,
            ['module1'],
        );
        expectSingleCompatibilityIssue(
            result,
            'Field "Test.field" should not be a list (required by module "module1").',
        );
    });
});

function run(
    baselineDoc: DocumentNode,
    docToCheck: DocumentNode,
    selectedModules: ReadonlyArray<string>,
    options: ModuleSelectionOptions = {},
): ValidationResult {
    const projectToCheck = new Project({
        sources: [new ProjectSource('to-check.graphql', print(docToCheck))],
    });

    const projectWithModules = new Project({
        sources: [
            new ProjectSource('baseline.graphql', print(baselineDoc)),
            new ProjectSource(
                'modules.json',
                JSON.stringify({ modules: ['module1', 'module2', 'module3', 'extra1', 'extra2'] }),
            ),
        ],
        modelOptions: { withModuleDefinitions: true },
    });
    const baselineProject = projectWithModules.withModuleSelection(selectedModules);

    return projectToCheck.checkCompatibility(baselineProject);
}
