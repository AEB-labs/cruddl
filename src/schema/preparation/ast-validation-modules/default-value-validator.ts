import {ASTValidator} from "../ast-validator";
import {DocumentNode} from "graphql";
import {ValidationMessage} from "../../../model/validation/message";
import {findDirectiveWithName, getNodeByName, getObjectTypes, hasDirectiveWithName} from "../../schema-utils";
import {
    DEFAULT_VALUE_DIRECTIVE,
    REFERENCE_DIRECTIVE,
    RELATION_DIRECTIVE,
    VALUE_ARG,
    VALUE_OBJECT_DIRECTIVE
} from "../../schema-defaults";

export const VALIDATION_ERROR_MISSING_ARGUMENT_DEFAULT_VALUE = DEFAULT_VALUE_DIRECTIVE + ' needs an argument named ' + VALUE_ARG;
export const VALIDATION_ERROR_DEFAULT_VALUE_NOT_ALLOWED_ON_VALUE_OBJECT = 'Default values are not allowed on value objects.';
export const VALIDATION_ERROR_DEFAULT_VALUE_NOT_ALLOWED_ON_RELATIONS = 'Default values cannot be set for relationships.';
export const VALIDATION_INFO_UNCHECKED = 'Take care, there are no type checks for default values yet.';

// Difuult!
export class DefaultValueValidator implements ASTValidator {

    validate(ast: DocumentNode): ValidationMessage[] {
        const validationMessages: ValidationMessage[] = [];
        getObjectTypes(ast).forEach(objectType => objectType.fields.forEach(field => {
            const defaultValueDirective = findDirectiveWithName(field, DEFAULT_VALUE_DIRECTIVE);
            if (!defaultValueDirective) return;
            if (hasDirectiveWithName(objectType, VALUE_OBJECT_DIRECTIVE)) {
                validationMessages.push(ValidationMessage.error(VALIDATION_ERROR_DEFAULT_VALUE_NOT_ALLOWED_ON_VALUE_OBJECT, {}, defaultValueDirective.loc));
                return
            }
            if (hasDirectiveWithName(field, RELATION_DIRECTIVE) || hasDirectiveWithName(field, REFERENCE_DIRECTIVE)) {
                validationMessages.push(ValidationMessage.error(VALIDATION_ERROR_DEFAULT_VALUE_NOT_ALLOWED_ON_RELATIONS, {}, defaultValueDirective.loc));
                return
            }
            const defaultValueArg = getNodeByName(defaultValueDirective.arguments, VALUE_ARG);
            if (!defaultValueArg) {
                validationMessages.push(ValidationMessage.error(VALIDATION_ERROR_MISSING_ARGUMENT_DEFAULT_VALUE, {}, defaultValueDirective.loc));
                return;
            }
            validationMessages.push(ValidationMessage.info(VALIDATION_INFO_UNCHECKED, {}, defaultValueArg.value.loc));
        }));
        return validationMessages;
    }

}
