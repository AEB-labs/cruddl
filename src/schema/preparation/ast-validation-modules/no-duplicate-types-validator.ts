import {ASTValidator} from "../ast-validator";
import {DocumentNode} from "graphql";
import {ValidationMessage} from "../validation-message";
import {
    ENUM_TYPE_DEFINITION,
    INPUT_OBJECT_TYPE_DEFINITION,
    INTERFACE_TYPE_DEFINITION,
    OBJECT_TYPE_DEFINITION,
    SCALAR_TYPE_DEFINITION,
    UNION_TYPE_DEFINITION
} from "graphql/language/kinds";

export const VALIDATION_ERROR_DUPLICATE_TYPE_NAMES = "Type name is already in use";

export class NoDuplicateTypesValidator implements ASTValidator {

    private typeNames = new Set<string>();

    validate(ast: DocumentNode): ValidationMessage[] {
        const validationMessages: ValidationMessage[] = [];
        ast.definitions.forEach(definition => {
            if (definition.kind === SCALAR_TYPE_DEFINITION ||
                definition.kind === INTERFACE_TYPE_DEFINITION ||
                definition.kind === OBJECT_TYPE_DEFINITION ||
                definition.kind === UNION_TYPE_DEFINITION ||
                definition.kind === ENUM_TYPE_DEFINITION ||
                definition.kind === INPUT_OBJECT_TYPE_DEFINITION) {
                if (this.typeNames.has(definition.name.value)) {
                    validationMessages.push(ValidationMessage.error(VALIDATION_ERROR_DUPLICATE_TYPE_NAMES, {name: definition.name.value}, definition.loc))
                } else {
                    this.typeNames.add(definition.name.value)
                }
            }
        });
        return validationMessages;
    }
}
