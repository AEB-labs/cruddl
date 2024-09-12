import { EnumType } from '../implementation';
import { ValidationContext, ValidationMessage } from '../validation';

export function checkEnumType(
    typeToCheck: EnumType,
    baselineType: EnumType,
    context: ValidationContext,
) {
    for (const baselineValue of baselineType.values) {
        const matchingValue = typeToCheck.values.find((v) => v.value === baselineValue.value);
        if (!matchingValue) {
            // No requiredBySuffix here because currently, it's not possible to assign individual
            // enum values to modules (the full enum is included in a module or it is not)
            context.addMessage(
                ValidationMessage.suppressableCompatibilityIssue(
                    'MISSING_ENUM_VALUE',
                    `Enum value "${baselineValue.value}" is missing.`,
                    typeToCheck.astNode,
                    { location: typeToCheck.nameASTNode },
                ),
            );
        }
    }
}
