import { ID_FIELD } from '../../schema/constants';
import { Field } from '../implementation/field';
import { ValidationMessage } from '../validation/message';
import { ValidationContext } from '../validation/validation-context';
import { getRequiredBySuffix } from './describe-module-specification';

/**
 * If the baseline field is annotated with @key, checks whether the field is annotated with @key, too
 */
export function checkKeyField(
    fieldToCheck: Field,
    baselineField: Field,
    context: ValidationContext,
) {
    const baselineFieldIsKeyField =
        baselineField.declaringType.isRootEntityType &&
        baselineField.declaringType.keyField === baselineField;
    const fieldToCheckIsKeyField =
        fieldToCheck.declaringType.isRootEntityType &&
        fieldToCheck.declaringType.keyField === fieldToCheck;
    if (baselineFieldIsKeyField && !fieldToCheckIsKeyField) {
        // special case: If the baseline requires id: ID @key, the fieldToCheck might not be authored at all
        // (because it's an automatic system field). We need to tell the user that the field needs to be added.
        if (fieldToCheck.isSystemField && fieldToCheck.name === ID_FIELD && !fieldToCheck.astNode) {
            context.addMessage(
                ValidationMessage.compatibilityIssue(
                    `Field "id: ID @key" needs to be specified${getRequiredBySuffix(
                        baselineField,
                    )}.`,
                    fieldToCheck.declaringType.nameASTNode,
                ),
            );
        } else {
            context.addMessage(
                ValidationMessage.compatibilityIssue(
                    `Field "${baselineField.declaringType.name}.${
                        baselineField.name
                    }" needs to be decorated with @key${getRequiredBySuffix(baselineField)}.`,
                    fieldToCheck.astNode,
                ),
            );
        }
    }
}
