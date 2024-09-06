import { expect } from 'chai';
import { Severity, ValidationResult } from '../../../src/model';
import {
    ModelComponent,
    ValidationContext,
} from '../../../src/model/validation/validation-context';
import { Project } from '../../../src/project/project';
import { applyChangeSet } from '../../../core-exports';

type Validatable = ModelComponent | ValidationResult | Project;

export function validate(component: Validatable): ValidationResult {
    if (component instanceof ValidationResult) {
        return component;
    }
    const context = new ValidationContext();
    const callResult = component.validate(context);
    if (callResult !== undefined) {
        // handle the case where a Project is given
        if ((callResult as unknown) instanceof ValidationResult) {
            return callResult;
        }
        throw new Error(
            `validate() unexpectedly had a return value that is not a ValidationResult`,
        );
    }
    return context.asResult();
}

export function expectToBeValid(component: Validatable) {
    const result = validate(component);
    expect(result.hasMessages(), result.toString()).to.be.false;
}

export function expectNoErrors(component: Validatable) {
    const result = validate(component);
    expect(
        result.hasErrors(),
        result
            .getErrors()
            .map((e) => e.toString())
            .join('\n'),
    ).to.be.false;
}

export function expectSingleError(component: Validatable, errorPart: string) {
    expectSingleMessage(component, errorPart, Severity.ERROR);
}

export function expectSingleCompatibilityIssue(component: Validatable, errorPart: string) {
    expectSingleMessage(component, errorPart, Severity.COMPATIBILITY_ISSUE);
}

export function expectSingleWarning(component: Validatable, errorPart: string) {
    expectSingleMessage(component, errorPart, Severity.WARNING);
}

export function expectSingleMessage(component: Validatable, errorPart: string, severity: Severity) {
    const result = validate(component);
    expect(result.messages.length, result.toString()).to.equal(1);
    const message = result.messages[0];
    expect(message.message).to.equal(errorPart);
    expect(message.severity).to.equal(severity);
}

export interface ExpectQuickFixOptions {
    /**
     * Optionally, the project that was validated
     *
     * Needed if the quick fix change set is not just a simple TextChange on a single file
     */
    readonly project?: Project;
}

export function expectQuickFix(
    component: Validatable,
    expectedDescription: string,
    expectedBody: string,
    { project }: ExpectQuickFixOptions = {},
) {
    const result = validate(component);
    const quickfixes = result.messages.flatMap((m) => m.quickFixes);
    expect(quickfixes.map((q) => q.description)).to.include(expectedDescription);
    const matchingQuickfixes = quickfixes.filter((q) => q.description === expectedDescription);
    expect(matchingQuickfixes).to.have.a.lengthOf(1);
    const quickfix = matchingQuickfixes[0];
    const changeSet = quickfix.getChangeSet();
    expect(changeSet.changes).not.to.be.empty;

    // in most simple test cases, we can recreate the project from the quick fix
    if (!project) {
        expect(changeSet.appendChanges).to.be.empty;
        const source = changeSet.textChanges[0].source;
        for (const change of changeSet.textChanges) {
            expect(change.source).to.equal(source);
        }
        project = new Project([source]);
    }

    const newProject = applyChangeSet(project, changeSet);
    expectToBeValid(newProject); // expect the fix to actually fix the issues
    expect(newProject.sources).to.have.a.lengthOf(1);
    expect(newProject.sources[0].body).to.equal(expectedBody);
}
