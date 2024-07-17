import { expect } from 'chai';
import { Severity, ValidationResult } from '../../../src/model';
import {
    ModelComponent,
    ValidationContext,
} from '../../../src/model/validation/validation-context';

export function validate(component: ModelComponent): ValidationResult {
    const context = new ValidationContext();
    component.validate(context);
    return context.asResult();
}

export function expectToBeValid(component: ModelComponent) {
    const result = validate(component);
    expect(result.hasMessages(), result.toString()).to.be.false;
}

export function expectSingleErrorToInclude(component: ModelComponent, errorPart: string) {
    expectSingleMessageToInclude(component, errorPart, Severity.ERROR);
}

export function expectSingleWarningToInclude(component: ModelComponent, errorPart: string) {
    expectSingleMessageToInclude(component, errorPart, Severity.WARNING);
}

export function expectSingleMessageToInclude(
    component: ModelComponent,
    errorPart: string,
    severity: Severity,
) {
    const result = validate(component);
    expect(result.messages.length, result.toString()).to.equal(1);
    const message = result.messages[0];
    expect(message.message).to.include(errorPart);
    expect(message.severity).to.equal(severity);
}
