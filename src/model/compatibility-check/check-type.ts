import { Type } from '../implementation';
import { ValidationContext, ValidationMessage } from '../validation';
import { checkEnumType } from './check-enum-type';
import { checkObjectType } from './check-object-type';
import { describeTypeKind } from './utils';

export function checkType(typeToCheck: Type, baselineType: Type, context: ValidationContext) {
    if (typeToCheck.kind !== baselineType.kind) {
        context.addMessage(
            ValidationMessage.suppressableCompatibilityIssue(
                'TYPE_KIND',
                `Type "${baselineType.name}" needs to be ${describeTypeKind(baselineType.kind)}.`,

                typeToCheck.astNode,
                { location: typeToCheck.nameASTNode },
            ),
        );
        return;
    }

    if (typeToCheck.isObjectType && baselineType.isObjectType) {
        checkObjectType(typeToCheck, baselineType, context);
    }

    if (typeToCheck.isEnumType && baselineType.isEnumType) {
        checkEnumType(typeToCheck, baselineType, context);
    }
}
