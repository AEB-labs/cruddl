import { Severity, ValidationResult } from '../../../src/model';
import { ModelComponent, ValidationContext } from '../../../src/model/validation/validation-context';
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
    expectSingleMessageToInclude(component, errorPart, Severity.Error);
}

export function expectSingleWarningToInclude(component: ModelComponent, errorPart: string) {
    expectSingleMessageToInclude(component, errorPart, Severity.Warning);
}

export function expectSingleMessageToInclude(component: ModelComponent, errorPart: string, severity: Severity) {
    return expectMultipleMessagesToInclude(component, errorPart, severity, 1);
}

export function expectMultipleMessagesToInclude(component: ModelComponent, errorPart: string, severity: Severity, numberOfMessages: number) {
    const result = validate(component);
    expect(result.messages.length, result.toString()).to.equal(numberOfMessages);
    const message = result.messages.find(m => m.message.indexOf(errorPart)>=0);
    expect(message).to.not.be.undefined;
    if(message) {
        expect(message.severity).to.equal(severity);
        expect(message.message).to.include(errorPart);
    }
}
