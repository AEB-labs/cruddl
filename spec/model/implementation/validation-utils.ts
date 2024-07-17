import { expect } from 'chai';
import { Severity, ValidationResult } from '../../../src/model';
import {
    ModelComponent,
    ValidationContext,
} from '../../../src/model/validation/validation-context';

export function validate(component: ModelComponent | ValidationResult): ValidationResult {
    if (component instanceof ValidationResult) {
        return component;
    }
    const context = new ValidationContext();
    component.validate(context);
    return context.asResult();
}

export function expectToBeValid(component: ModelComponent | ValidationResult) {
    const result = validate(component);
    expect(result.hasMessages(), result.toString()).to.be.false;
}

export function expectSingleError(component: ModelComponent | ValidationResult, errorPart: string) {
    expectSingleMessage(component, errorPart, Severity.ERROR);
}

export function expectSingleCompatibilityIssue(
    component: ModelComponent | ValidationResult,
    errorPart: string,
) {
    expectSingleMessage(component, errorPart, Severity.COMPATIBILITY_ISSUE);
}

export function expectSingleWarning(
    component: ModelComponent | ValidationResult,
    errorPart: string,
) {
    expectSingleMessage(component, errorPart, Severity.WARNING);
}

export function expectSingleMessage(
    component: ModelComponent | ValidationResult,
    errorPart: string,
    severity: Severity,
) {
    const result = validate(component);
    expect(result.messages.length, result.toString()).to.equal(1);
    const message = result.messages[0];
    expect(message.message).to.equal(errorPart);
    expect(message.severity).to.equal(severity);
}
