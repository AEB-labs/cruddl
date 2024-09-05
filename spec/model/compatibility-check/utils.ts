import { DocumentNode } from 'graphql';
import { ValidationResult } from '../../../src/model/validation/result';
import { Project } from '../../../src/project/project';
import { ProjectSource } from '../../../src/project/source';
import { expectNoErrors, expectToBeValid } from '../implementation/validation-utils';
import { prettyPrint } from '../../../src/graphql/pretty-print';

interface RunOptions {
    allowWarningsAndInfosInProjectToCheck?: boolean;
    allowWarningsAndInfosInBaselineProject?: boolean;
}

export function runCheck(
    baselineDoc: DocumentNode,
    docToCheck: DocumentNode | Project,
    options: RunOptions = {},
): ValidationResult {
    // allow this to be a Project in case the caller needs this for applyChangeSet
    const projectToCheck =
        docToCheck instanceof Project
            ? docToCheck
            : new Project({
                  sources: [new ProjectSource('to-check.graphql', prettyPrint(docToCheck))],
              });
    if (options.allowWarningsAndInfosInProjectToCheck) {
        expectNoErrors(projectToCheck);
    } else {
        expectToBeValid(projectToCheck);
    }

    const projectWithModules = new Project({
        sources: [
            new ProjectSource('baseline.graphql', prettyPrint(baselineDoc)),
            new ProjectSource(
                'modules.json',
                JSON.stringify({ modules: ['module1', 'module2', 'module3', 'extra1', 'extra2'] }),
            ),
        ],
        modelOptions: { withModuleDefinitions: true },
    });
    if (options.allowWarningsAndInfosInBaselineProject) {
        expectNoErrors(projectWithModules);
    } else {
        expectToBeValid(projectWithModules);
    }

    // while we could test the compatibility check without modules, including this in the test allows us
    // to ensure that all messages have the required-by-modules suffix.
    const baselineProject = projectWithModules.withModuleSelection(['module1']);
    const baselineValidationResult = baselineProject.validate();
    if (baselineValidationResult.hasErrors()) {
        throw new Error(
            `withModuleSelection created a project with validation errors. Project:\n${baselineProject.sources
                .map((s) => s.body)
                .join('\n----\n')}\n\nProblems:\n${baselineValidationResult.toString()}`,
        );
    }

    return projectToCheck.checkCompatibility(baselineProject);
}
