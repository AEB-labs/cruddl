import type { RootEntityType } from '../implementation/index.js';
import type { ValidationContext } from '../validation/index.js';
import { ValidationMessage } from '../validation/index.js';

export function checkBusinessObject(
    typeToCheck: RootEntityType,
    baselineType: RootEntityType,
    context: ValidationContext,
) {
    if (baselineType.isBusinessObject && !typeToCheck.isBusinessObject) {
        context.addMessage(
            ValidationMessage.suppressableCompatibilityIssue(
                'BUSINESS_OBJECT',
                `Type "${baselineType.name}" needs to be decorated with @businessObject.`,
                typeToCheck.astNode,
                { location: typeToCheck.nameASTNode },
            ),
        );
    }
}
