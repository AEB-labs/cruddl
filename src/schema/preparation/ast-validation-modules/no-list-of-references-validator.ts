import {ASTValidator} from "../ast-validator";
import {DocumentNode} from "graphql";
import {ValidationMessage} from "../validation-message";
import {getObjectTypes, hasDirectiveWithName} from "../../schema-utils";
import {LIST_TYPE, NON_NULL_TYPE} from "../../../graphql/kinds";
import {REFERENCE_DIRECTIVE} from "../../schema-defaults";

export const VALIDATION_ERROR_LIST_OF_REFERENCES_NOT_SUPPORTED = 'Lists of @reference are not supported. Use a child entity with a field of the reference instead.';

export class NoListOfReferencesValidator implements ASTValidator {

    public validate(ast: DocumentNode): ValidationMessage[] {
        const validationMessages: ValidationMessage[] = [];
        getObjectTypes(ast).forEach(objectType => objectType.fields.forEach(field => {
            if (field.type.kind === LIST_TYPE || field.type.kind === NON_NULL_TYPE && field.type.type.kind === LIST_TYPE ) {
                if (hasDirectiveWithName(field, REFERENCE_DIRECTIVE)) {
                    validationMessages.push(ValidationMessage.error(VALIDATION_ERROR_LIST_OF_REFERENCES_NOT_SUPPORTED, {}, field.loc))
                }
            }
        }));
        return validationMessages;
    }

}