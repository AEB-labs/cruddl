import { EnumType } from '../implementation';
import { ValidationContext, ValidationMessage } from '../validation';
import { getRequiredBySuffix } from './describe-module-specification';

export function checkEnumType(
    typeToCheck: EnumType,
    baselineType: EnumType,
    context: ValidationContext,
) {
    for (const baselineValue of baselineType.values) {
        const matchingValue = typeToCheck.values.find((v) => v.value === baselineValue.value);
        if (!matchingValue) {
            context.addMessage(
                ValidationMessage.compatibilityIssue(
                    `Enum value "${baselineValue.value}" is missing${getRequiredBySuffix(
                        baselineType,
                    )}.`,
                    typeToCheck.nameASTNode,
                ),
            );
        }
    }
}
