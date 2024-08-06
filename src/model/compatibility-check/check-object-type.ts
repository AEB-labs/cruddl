import { ObjectType } from '../implementation';
import { ValidationContext, ValidationMessage } from '../validation';
import { checkField } from './check-field';
import { checkRootEntityType } from './check-root-entity-type';
import { getRequiredBySuffix } from './describe-module-specification';

export function checkObjectType(
    typeToCheck: ObjectType,
    baselineType: ObjectType,
    context: ValidationContext,
) {
    for (const baselineField of baselineType.fields) {
        const matchingField = typeToCheck.getField(baselineField.name);

        if (!matchingField) {
            context.addMessage(
                ValidationMessage.compatibilityIssue(
                    `Field "${baselineType.name}.${
                        baselineField.name
                    }" is missing${getRequiredBySuffix(baselineField)}.`,
                    typeToCheck.nameASTNode,
                ),
            );
            continue;
        }

        checkField(matchingField, baselineField, context);
    }

    if (baselineType.isRootEntityType && typeToCheck.isRootEntityType) {
        checkRootEntityType(typeToCheck, baselineType, context);
    }
}
