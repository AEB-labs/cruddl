import type { RolesSpecifierConfig } from '../config/permissions.js';
import { ValidationMessage } from '../validation/message.js';
import type { ModelComponent, ValidationContext } from '../validation/validation-context.js';
import type { Field } from './field.js';
import type { Type } from './type.js';

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
