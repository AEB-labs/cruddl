import { CALC_MUTATIONS_OPERATORS_ARG } from '../../schema/constants';
import { Field } from '../implementation';
import { ValidationContext, ValidationMessage } from '../validation';
import { getRequiredBySuffix } from './describe-module-specification';

/**
 * Checks whether all calc mutations defined in the baseline field are also present in the field to check
 */
export function checkCalcMutations(
    fieldToCheck: Field,
    baselineField: Field,
    context: ValidationContext,
) {
    if (!baselineField.calcMutationOperators.size) {
        return;
    }

    const operators = [...baselineField.calcMutationOperators];

    // missing @calcMutations
    if (!fieldToCheck.calcMutationOperators.size) {
        const operatorsDesc = operators.map((o) => o.toString()).join(', ');
        const expectedDeclaration = `@calcMutations(operators: [${operatorsDesc}])`;
        context.addMessage(
            ValidationMessage.suppressableCompatibilityIssue(
                'CALC_MUTATIONS',
                `Field "${baselineField.declaringType.name}.${
                    baselineField.name
                }" should be decorated with ${expectedDeclaration}${getRequiredBySuffix(
                    baselineField,
                )}.`,
                fieldToCheck.astNode,
            ),
        );
        return;
    }

    // missing operators
    const missingOperators = operators.filter((o) => !fieldToCheck.calcMutationOperators.has(o));
    if (missingOperators.length) {
        let message;
        if (missingOperators.length === 1) {
            message = `Operator ${missingOperators[0]} is missing`;
        } else {
            message =
                'Operators ' +
                missingOperators.slice(0, missingOperators.length - 1).join(', ') +
                ' and ' +
                missingOperators[missingOperators.length - 1] +
                ' are missing';
        }

        const operatorsAstNode = fieldToCheck.calcMutationsAstNode?.arguments?.find(
            (a) => a.name.value === CALC_MUTATIONS_OPERATORS_ARG,
        );
        context.addMessage(
            ValidationMessage.suppressableCompatibilityIssue(
                'CALC_MUTATIONS',
                `${message}${getRequiredBySuffix(baselineField)}.`,
                fieldToCheck.astNode,
                {
                    location: operatorsAstNode ?? fieldToCheck.calcMutationsAstNode,
                },
            ),
        );
        return;
    }
}
