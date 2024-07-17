import { Model } from '../implementation';
import { ValidationResult, ValidationMessage, ValidationContext } from '../validation';
import { checkType } from './check-type';
import { getRequiredBySuffix } from './describe-module-specification';

/**
 * Checks whether a model (modelToCheck) can be used in a place where another model (baselineModel) is expected.
 */
export function checkModel(modelToCheck: Model, baselineModel: Model): ValidationResult {
    const context = new ValidationContext();

    for (const baselineType of baselineModel.types) {
        const matchingType = modelToCheck.getType(baselineType.name);
        if (!matchingType) {
            context.addMessage(
                ValidationMessage.compatibilityIssue(
                    `Type "${baselineType.name}" is missing${getRequiredBySuffix(baselineType)}.`,
                    undefined,
                ),
            );
            continue;
        }

        checkType(matchingType, baselineType, context);
    }

    return context.asResult();
}
