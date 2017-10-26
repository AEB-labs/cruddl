import {ASTValidator} from "../ast-validator";
import {DocumentNode} from "graphql";
import {ValidationMessage} from "../validation-message";
import {getObjectTypes} from "../../schema-utils";

export const VALIDATION_WARNING_OBJECT_TYPE_WITHOUT_FIELDS = "Object type has no fields";

export class NoEmptyObjectTypesValidator implements ASTValidator {

    validate(ast: DocumentNode): ValidationMessage[] {
        const validationMessages: ValidationMessage[] = [];
            getObjectTypes(ast).forEach(objectType => {
                if (!objectType.fields.length) {
                    validationMessages.push(ValidationMessage.warn(VALIDATION_WARNING_OBJECT_TYPE_WITHOUT_FIELDS, {}, objectType.loc))
                }
            });
        return validationMessages;
    }

}