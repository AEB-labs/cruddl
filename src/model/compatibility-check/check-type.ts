import { Type } from '../implementation/index.js';
import { ValidationContext, ValidationMessage } from '../validation/index.js';
import { checkEnumType } from './check-enum-type.js';
import { checkObjectType } from './check-object-type.js';
import { describeTypeKind } from './utils.js';

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
