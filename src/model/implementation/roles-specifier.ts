import { ModelComponent, ValidationContext } from '../validation/validation-context';
import { RolesSpecifierConfig } from '../config';
import { ValidationMessage } from '../validation';
import { WarningCode } from '../validation/suppress/message-codes';
import { Type } from './type';
import { Field } from './field';

export class RolesSpecifier implements ModelComponent {
    readonly read: ReadonlyArray<string>;
    readonly readWrite: ReadonlyArray<string>;

    constructor(
        private readonly input: RolesSpecifierConfig,
        private readonly declaringFieldOrType: Type | Field,
    ) {
        this.read = input.read || [];
        this.readWrite = input.readWrite || [];
    }

    validate(context: ValidationContext) {
        if (this.read.length === 0 && this.readWrite.length === 0) {
            context.addMessage(
                ValidationMessage.suppressableWarning(
                    'NO_ROLES',
                    `No roles with read access are specified. Access is denied for everyone.`,
                    this.declaringFieldOrType.astNode,
                    { location: this.input.astNode },
                ),
            );
        }

        if ([...this.read, ...this.readWrite].some((role) => role === '')) {
            context.addMessage(
                ValidationMessage.suppressableWarning(
                    'EMPTY_NAME',
                    `Specified empty string as role.`,
                    this.declaringFieldOrType.astNode,
                    { location: this.input.astNode },
                ),
            );
        }
    }
}
