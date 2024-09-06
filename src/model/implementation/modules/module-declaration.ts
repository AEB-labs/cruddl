import { ModuleConfig } from '../../config/module';
import { MessageLocation, ValidationMessage } from '../../validation';
import { ModelComponent, ValidationContext } from '../../validation/validation-context';
import {
    MODULE_IDENTIFIER_PATTERN,
    ALLOWD_MODULE_IDENTIFIER_CHARACTERS_DESCRIPTION,
} from './patterns';

/**
 * A module that can be assigned to types and fields
 */
export class ModuleDeclaration implements ModelComponent {
    readonly name: string;
    readonly loc: MessageLocation | undefined;

    constructor(private readonly config: ModuleConfig) {
        this.name = config.name;
        this.loc = config.loc;
    }

    validate(context: ValidationContext) {
        if (!this.name) {
            context.addMessage(ValidationMessage.error(`Module names cannot be empty`, this.loc));
        } else if (!this.name.match(MODULE_IDENTIFIER_PATTERN)) {
            context.addMessage(
                ValidationMessage.error(
                    `Module names can only consist of ${ALLOWD_MODULE_IDENTIFIER_CHARACTERS_DESCRIPTION}`,
                    this.loc,
                ),
            );
        }
    }
}
