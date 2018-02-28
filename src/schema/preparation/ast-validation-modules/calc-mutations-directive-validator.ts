import { DocumentNode } from 'graphql';
import { LIST_TYPE } from '../../../graphql/kinds';
import { CALC_MUTATIONS_DIRECTIVE, CALC_MUTATIONS_OPERATORS_ARG } from '../../schema-defaults';
import { findDirectiveWithName, getCalcMutationOperatorsFromDirective, getObjectTypes, getTypeNameIgnoringNonNullAndList } from '../../schema-utils';
import { ASTValidator } from '../ast-validator';
import { ValidationMessage } from '../validation-message';

export const VALIDATION_ERROR_NO_OPERATORS = `Directive "@${CALC_MUTATIONS_DIRECTIVE}" must have an argument named "${CALC_MUTATIONS_OPERATORS_ARG}" with at least one operator.`;
export const VALIDATION_ERROR_DUPLICATE_OPERATORS = `Each operator may only be included once, in directive "@${CALC_MUTATIONS_DIRECTIVE}"`;

export class CalcMutationsDirectiveValidator implements ASTValidator {

    validate(ast: DocumentNode): ValidationMessage[] {
        const validationMessages: ValidationMessage[] = [];
        getObjectTypes(ast).forEach(objectType => {
            objectType.fields.forEach(field => {
                const directive = findDirectiveWithName(field, CALC_MUTATIONS_DIRECTIVE)
                if (directive) {
                    const operators = getCalcMutationOperatorsFromDirective(directive);
                    if(operators.length == 0) {
                        validationMessages.push(ValidationMessage.error(VALIDATION_ERROR_NO_OPERATORS, {name: directive.name.value}, directive.loc))
                    } else {
                        if(new Set(operators.map(op => op.name)).size < operators.length) {
                            validationMessages.push(ValidationMessage.error(VALIDATION_ERROR_DUPLICATE_OPERATORS, {name: directive.name.value}, directive.loc))
                        }

                        operators.forEach( operator => {
                            if(field.type.kind === LIST_TYPE || !operator.supportedTypes.includes(getTypeNameIgnoringNonNullAndList(field.type))){
                                validationMessages.push(ValidationMessage.error(
                                    `Operator "${operator.name}" is only allowed for fields with the following types: ${operator.supportedTypes}`,
                                    {name: directive.name.value},
                                    directive.loc))
                            }
                        })
                    }
                }
            })
        });
        return validationMessages;
    }

}