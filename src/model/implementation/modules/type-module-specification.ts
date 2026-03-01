import { MODULES_DIRECTIVE, MODULES_IN_ARG } from '../../../schema/constants.js';
import { TypeModuleSpecificationConfig } from '../../config/module-specification.js';
import { ValidationMessage } from '../../validation/index.js';
import { ValidationContext } from '../../validation/validation-context.js';
import { Type } from '../type.js';
import { BaseModuleSpecification } from './base-module-specification.js';

export class TypeModuleSpecification extends BaseModuleSpecification {
    readonly includeAllFields: boolean;

    constructor(
        private readonly config: TypeModuleSpecificationConfig,
        private readonly type: Type,
    ) {
        super(config, type.model);
        this.includeAllFields = config.includeAllFields;
    }

    validate(context: ValidationContext): void {
        super.validate(context);

        if (!this.clauses) {
            context.addMessage(
                ValidationMessage.error(
                    `@${MODULES_DIRECTIVE}(${MODULES_IN_ARG}: ...) needs to be specified.`,
                    this.astNode,
                ),
            );
        }

        if (this.type.isEnumType && this.includeAllFields) {
            context.addMessage(
                ValidationMessage.error(
                    `includeAllFields cannot be specified for enum types.`,
                    this.config.includeAllFieldsAstNode,
                ),
            );
        }
    }
}
