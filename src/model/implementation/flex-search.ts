import { FieldPath } from './field-path';
import { OrderDirection } from './order';
import { ModelComponent, ValidationContext } from '../validation/validation-context';
import { FlexSearchPrimarySortClauseConfig } from '../config';
import { RootEntityType } from './root-entity-type';
import { Severity, ValidationMessage } from '../validation';
import { WarningCode } from '../validation/suppress/message-codes';

export const IDENTITY_ANALYZER = 'identity';
export const NORM_CI_ANALYZER = 'norm_ci';

export class FlexSearchPrimarySortClause implements ModelComponent {
    readonly field: FieldPath;
    readonly direction: OrderDirection;

    constructor(
        private readonly config: FlexSearchPrimarySortClauseConfig,
        private readonly baseType: RootEntityType,
    ) {
        this.field = new FieldPath({
            path: config.field,
            baseType,
            location: config.fieldASTNode,
            canUseCollectFields: false,
            canTraverseRootEntities: false,
        });
        this.direction = config.direction;
    }

    validate(context: ValidationContext) {
        const subContext = new ValidationContext();
        this.field.validate(subContext);
        for (const message of subContext.validationMessages) {
            if (message.severity === Severity.ERROR) {
                // we did not report any errors previously. In a transition period, we make it clear
                // that these warnings will be errors in the future.
                context.addMessage(
                    ValidationMessage.suppressableWarning(
                        'DEPRECATED',
                        message.message +
                            (message.message.endsWith('.') ? '' : '.') +
                            ' This will be an error in a future release.',
                        this.baseType.astNode,
                        { location: message.location },
                    ),
                );
            } else {
                context.addMessage(message);
            }
        }

        const lastField = this.field.lastField;

        if (!lastField) {
            // FieldPath already found validation errors
            return;
        }

        if (!lastField.type.isScalarType && !lastField.type.isEnumType) {
            context.addMessage(
                ValidationMessage.suppressableWarning(
                    'DEPRECATED',
                    `Field "${lastField.declaringType.name}.${lastField.name}" is an object field, but only scalar and enum fields are supported in flexSearchOrder. Choose a subfield or a different field. This will be an error in a future release.`,
                    this.baseType.astNode,
                    { location: this.config.fieldASTNode },
                ),
            );
        }
    }
}
