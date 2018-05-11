import {ASTValidator} from "../ast-validator";
import {__Directive, DocumentNode} from "graphql";
import {ValidationMessage} from "../../../model/validation/message";
import {getObjectTypes} from "../../schema-utils";
import {ALL_FIELD_DIRECTIVES, ALL_OBJECT_TYPE_DIRECTIVES} from "../../schema-defaults";

export const VALIDATION_ERROR_UNKNOWN_OBJECT_TYPE_DIRECTIVE = 'Unknown object type directive';

export class KnownObjectTypeDirectivesValidator implements ASTValidator {

    validate(ast: DocumentNode): ValidationMessage[] {
        const validationMessages: ValidationMessage[] = [];
        getObjectTypes(ast).forEach(objectType => {
            if (objectType.directives) {
                objectType.directives.forEach(directive => {
                    if (!ALL_OBJECT_TYPE_DIRECTIVES.includes(directive.name.value)) {
                        validationMessages.push(ValidationMessage.error(VALIDATION_ERROR_UNKNOWN_OBJECT_TYPE_DIRECTIVE, {name: directive.name.value}, directive.loc))
                    }
                })
            }
        });
        return validationMessages;
    }

}