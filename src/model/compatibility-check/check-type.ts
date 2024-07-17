import { Type } from '../implementation';
import { ValidationContext, ValidationMessage } from '../validation';
import { checkObjectType } from './check-object-type';
import { getRequiredBySuffix } from './describe-module-specification';
import { describeTypeKind } from './utils';

export function checkType(typeToCheck: Type, baselineType: Type, context: ValidationContext) {
    if (typeToCheck.kind !== baselineType.kind) {
        // TODO format the type kind nicer
        context.addMessage(
            ValidationMessage.compatibilityIssue(
                `Type "${baselineType.name}" needs to be ${describeTypeKind(
                    baselineType.kind,
                )}${getRequiredBySuffix(baselineType)}.`,
                typeToCheck.nameASTNode,
            ),
        );
        return;
    }

    if (baselineType.isObjectType) {
        if (!typeToCheck.isObjectType) {
            // covered by kind check above
            throw new Error(`Expected isObjectType to be true`);
        }
        checkObjectType(typeToCheck, baselineType, context);
    }
}
