import { ObjectType, RootEntityType } from '../implementation';
import { ValidationContext, ValidationMessage } from '../validation';
import { checkField } from './check-field';
import { getRequiredBySuffix } from './describe-module-specification';

export function checkBusinessObject(
    typeToCheck: RootEntityType,
    baselineType: RootEntityType,
    context: ValidationContext,
) {
    if (baselineType.isBusinessObject && !typeToCheck.isBusinessObject) {
        context.addMessage(
            ValidationMessage.suppressableCompatibilityIssue(
                'BUSINESS_OBJECT',
                `Type "${
                    baselineType.name
                }" needs to be decorated with @businessObject${getRequiredBySuffix(baselineType)}.`,
                typeToCheck.astNode,
                { location: typeToCheck.nameASTNode },
            ),
        );
    }
}
