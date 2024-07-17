import { MODULES_DIRECTIVE, MODULES_IN_ARG } from '../../../schema/constants';
import { TypeModuleSpecificationConfig } from '../../config/module-specification';
import { ValidationMessage } from '../../validation';
import { ValidationContext } from '../../validation/validation-context';
import { Model } from '../model';
import { BaseModuleSpecification } from './base-module-specification';

export class TypeModuleSpecification extends BaseModuleSpecification {
    readonly includeAllFields: boolean;

    constructor(private readonly config: TypeModuleSpecificationConfig, model: Model) {
        super(config, model);
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
    }
}
