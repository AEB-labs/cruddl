import {ASTValidator} from "../ast-validator";
import {DocumentNode} from "graphql";
import {Severity, ValidationMessage} from "../validation-message";
import {getObjectTypes} from "../../schema-utils";
import {CHILD_ENTITY_DIRECTIVE, OBJECT_TYPE_ENTITY_DIRECTIVES, ROOT_ENTITY_DIRECTIVE} from "../../schema-defaults";

export const VALIDATION_ERROR_OBJECT_TYPE_WITHOUT_FIELDS = "Object type has no fields";

export class NoEmptyObjectTypesValidator implements ASTValidator {

    validate(ast: DocumentNode): ValidationMessage[] {
        const validationMessages: ValidationMessage[] = [];
            getObjectTypes(ast).forEach(objectType => {
                if (!objectType.fields.length) {
                    const entityDirective = objectType.directives!
                        .find(directive => OBJECT_TYPE_ENTITY_DIRECTIVES.includes(directive.name.value))!
                        .name.value;
                    validationMessages.push(ValidationMessage.error(VALIDATION_ERROR_OBJECT_TYPE_WITHOUT_FIELDS, {}, objectType.loc))
                }
            });
        return validationMessages;
    }

}