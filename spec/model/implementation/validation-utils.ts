import { Severity, ValidationResult } from '../../../src/model/validation';
import { ModelComponent, ValidationContext } from '../../../src/model/implementation/validation';
import { expect } from 'chai';

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
    const result = validate(component);
    expect(result.messages.length, result.toString()).to.equal(1);
    const message = result.messages[0];
    expect(message.severity).to.equal(Severity.Error);
    expect(message.message).to.include(errorPart);
}