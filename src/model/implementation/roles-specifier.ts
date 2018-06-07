import { ModelComponent, ValidationContext } from '../validation/validation-context';
import { RolesSpecifierConfig } from '../config';
import { ValidationMessage } from '../validation';

export class RolesSpecifier implements ModelComponent {
    readonly read: ReadonlyArray<string>;
    readonly readWrite: ReadonlyArray<string>;

    constructor(private readonly input: RolesSpecifierConfig) {
        this.read = input.read || [];
        this.readWrite = input.readWrite || [];
    }

    validate(context: ValidationContext) {
        if (this.read.length === 0 && this.readWrite.length === 0) {
            context.addMessage(ValidationMessage.warn(`No roles with read access are specified. Access is denied for everyone.`, undefined, this.input.astNode));
        }

        if ([...this.read, ...this.readWrite].some(role => role === '')) {
            context.addMessage(ValidationMessage.warn(`Specified empty string as role.`, undefined, this.input.astNode));
        }
    }
}
