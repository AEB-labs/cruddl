import {ASTValidator} from "../ast-validator";
import {DocumentNode} from "graphql";
import {ValidationMessage} from "../validation-message";
import {findDirectiveWithName, getValueObjectTypes, hasDirectiveWithName} from "../../schema-utils";
import {ROLES_DIRECTIVE} from "../../schema-defaults";

export const VALIDATION_ERROR_ROLES_NOT_ALLOWED_FOR_VALUE_OBJECTS = '@roles is not allowed on value objects.';

export class NoRolesOnValueObjectsValidator implements ASTValidator {

    validate(ast: DocumentNode): ValidationMessage[] {
        const validationMessages: ValidationMessage[] = [];
        getValueObjectTypes(ast).forEach(valueObject => {
            const roles = findDirectiveWithName(valueObject, ROLES_DIRECTIVE);
            if (roles) {
                validationMessages.push(ValidationMessage.error(VALIDATION_ERROR_ROLES_NOT_ALLOWED_FOR_VALUE_OBJECTS, {}, roles.loc))
            }
            valueObject.fields.forEach(field => {
                const fieldRoles = findDirectiveWithName(field, ROLES_DIRECTIVE);
                if (fieldRoles) {
                    validationMessages.push(ValidationMessage.error(VALIDATION_ERROR_ROLES_NOT_ALLOWED_FOR_VALUE_OBJECTS, {}, fieldRoles.loc))
                }
            })
        });
        return validationMessages;
    }

}