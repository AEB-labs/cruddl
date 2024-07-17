import { ASTNode } from 'graphql';
import {
    BaseModuleSpecificationConfig,
    ModuleSpecificationClauseConfig,
} from '../../config/module-specification';
import { ModelComponent, ValidationContext } from '../../validation/validation-context';
import { Model } from '..';
import { parseModuleSpecificationExpression } from './expression-parser';
import { ValidationMessage, locationWithinStringArgument } from '../../validation';
import memorize from 'memorize-decorator';

export abstract class BaseModuleSpecification implements ModelComponent {
    readonly clauses: ReadonlyArray<ModuleSpecificationClause> | null;
    readonly astNode: ASTNode | undefined;
    readonly inAstNode: ASTNode | undefined;

    constructor(config: BaseModuleSpecificationConfig, protected readonly model: Model) {
        this.clauses = config.in
            ? config.in.map((clauseConfig) => new ModuleSpecificationClause(clauseConfig, model))
            : null;
        this.astNode = config.astNode;
        this.inAstNode = config.inAstNode;
    }

    validate(context: ValidationContext): void {
        if (this.clauses) {
            for (const item of this.clauses) {
                item.validate(context);
            }
        }
    }
}

export class ModuleSpecificationClause implements ModelComponent {
    readonly expression: string;

    constructor(
        private readonly config: ModuleSpecificationClauseConfig,
        private readonly model: Model,
    ) {
        this.expression = config.expression;
    }

    @memorize()
    get andCombinedModules(): ReadonlyArray<string> {
        return this.parse(new ValidationContext());
    }

    validate(context: ValidationContext): void {
        this.parse(context);
    }

    private parse(context: ValidationContext): ReadonlyArray<string> {
        if (!this.expression) {
            context.addMessage(
                ValidationMessage.error(`Module specifier cannot be empty.`, this.config.astNode),
            );
            return [];
        }

        const result = parseModuleSpecificationExpression(this.expression);
        if (result.error) {
            context.addMessage(
                ValidationMessage.error(
                    result.error.message,
                    this.config.astNode
                        ? locationWithinStringArgument(
                              this.config.astNode,
                              result.error.offset,

                              // we don't have a lexer before running the parser, so we don't have "tokens" that we could use to determine the length.
                              // Instead, we just mark everything starting from the faulty position to the end as an error.
                              // result.error.offset can be on the "EOL characeter". Use at least a width of 1, so we report this on the closing " character
                              Math.max(this.expression.length - result.error.offset, 1),
                          )
                        : undefined,
                ),
            );
            return [];
        }

        if (!result.andCombinedIdentifiers) {
            // should not be possible
            throw new Error(`Did not expect andCombinedIdentifiers to be empty`);
        }

        let hasInvalidModules = false;
        const declaredModules = new Set(this.model.modules.map((m) => m.name));
        for (const identifier of result.andCombinedIdentifiers) {
            if (!declaredModules.has(identifier.name)) {
                hasInvalidModules = true;
                context.addMessage(
                    ValidationMessage.error(
                        `Module "${identifier.name}" does not exist.`,
                        this.config.astNode
                            ? locationWithinStringArgument(
                                  this.config.astNode,
                                  identifier.offset,
                                  identifier.name.length,
                              )
                            : undefined,
                    ),
                );
            }
        }
        if (hasInvalidModules) {
            return [];
        }

        return result.andCombinedIdentifiers.map((i) => i.name);
    }
}
