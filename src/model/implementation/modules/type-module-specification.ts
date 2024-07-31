import { MODULES_DIRECTIVE, MODULES_IN_ARG } from '../../../schema/constants';
import { TypeModuleSpecificationConfig } from '../../config/module-specification';
import { ValidationMessage } from '../../validation';
import { ValidationContext } from '../../validation/validation-context';
import { Type } from '../type';
import { BaseModuleSpecification } from './base-module-specification';

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
