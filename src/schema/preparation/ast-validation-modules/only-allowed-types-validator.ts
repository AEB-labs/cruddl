import {ASTValidator} from "../ast-validator";
import {DocumentNode} from "graphql";
import {ValidationMessage} from "../validation-message";
import {ENUM_TYPE_DEFINITION, OBJECT_TYPE_DEFINITION} from "../../../graphql/kinds";

export const VALIDATION_ERROR_INVALID_TYPE_KIND = "This kind of definition is not allowed. Only object and enum type definitions are allowed.";

export class OnlyAllowedTypesValidator implements ASTValidator {

    validate(ast: DocumentNode): ValidationMessage[] {
        const validationMessages: ValidationMessage[] = [];
        ast.definitions.forEach(definition => {
            if (![<string> OBJECT_TYPE_DEFINITION, <string>ENUM_TYPE_DEFINITION].includes(definition.kind)) {
                validationMessages.push(ValidationMessage.error(VALIDATION_ERROR_INVALID_TYPE_KIND, {kind: definition.kind}, definition.loc))
            }
        });
        return validationMessages;
    }
}
