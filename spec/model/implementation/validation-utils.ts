import { expect } from 'chai';
import { Severity, ValidationResult } from '../../../src/model';
import {
    ModelComponent,
    ValidationContext,
} from '../../../src/model/validation/validation-context';
import { Project } from '../../../src/project/project';

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
