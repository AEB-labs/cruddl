import { Model } from '..';
import { MODULES_ALL_ARG, MODULES_IN_ARG } from '../../../schema/constants';
import { FieldModuleSpecificationConfig } from '../../config/module-specification';
import { ValidationMessage } from '../../validation';
import { ValidationContext } from '../../validation/validation-context';
import { BaseModuleSpecification } from './base-module-specification';

export class FieldModuleSpecification extends BaseModuleSpecification {
    readonly all: boolean;

    constructor(private readonly config: FieldModuleSpecificationConfig, model: Model) {
        super(config, model);
        this.all = config.all;
    }

    validate(context: ValidationContext): void {
        super.validate(context);

        if (this.all && this.clauses) {
            context.addMessage(
                ValidationMessage.error(
                    `"${MODULES_ALL_ARG}" and "${MODULES_IN_ARG}" cannot be combined.`,
                    this.config.allAstNode,
                ),
            );
        }

        if (!this.all && !this.clauses) {
            context.addMessage(
                ValidationMessage.error(
                    `Either "${MODULES_ALL_ARG}" or "${MODULES_IN_ARG}" needs to be specified.`,
                    this.astNode,
                ),
            );
        }
    }
}
