import {ASTValidator} from "../ast-validator";
import {__Directive, DocumentNode} from "graphql";
import {ValidationMessage} from "../validation-message";
import {getObjectTypes} from "../../schema-utils";
import {ALL_FIELD_DIRECTIVES} from "../../schema-defaults";

export const VALIDATION_ERROR_UNKNOWN_FIELD_DIRECTIVE = 'Unknown field directive';

export class KnownFieldDirectivesValidator implements ASTValidator {

    validate(ast: DocumentNode): ValidationMessage[] {
        const validationMessages: ValidationMessage[] = []
        getObjectTypes(ast).forEach(objectType => {
            objectType.fields.forEach(field => {
                if (field.directives) {
                    field.directives.forEach(directive => {
                        if (!ALL_FIELD_DIRECTIVES.includes(directive.name.value)) {
                            validationMessages.push(ValidationMessage.error(VALIDATION_ERROR_UNKNOWN_FIELD_DIRECTIVE, {name: directive.name.value}, directive.loc))
                        }
                    })
                }
            })
        })
        return validationMessages;
    }

}