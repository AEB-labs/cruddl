import {ASTValidator} from "../ast-validator";
import {DocumentNode, ObjectTypeDefinitionNode, TypeDefinitionNode} from "graphql";
import {ValidationMessage} from "../validation-message";
import {
    ENUM_TYPE_DEFINITION,
    INPUT_OBJECT_TYPE_DEFINITION,
    INTERFACE_TYPE_DEFINITION,
    OBJECT_TYPE_DEFINITION,
    SCALAR_TYPE_DEFINITION,
    UNION_TYPE_DEFINITION
} from "graphql/language/kinds";

export const VALIDATION_ERROR_DUPLICATE_TYPE_NAMES = "Duplicate type name";

export class NoDuplicateTypesValidator implements ASTValidator {

    validate(ast: DocumentNode): ValidationMessage[] {
        const usedTypesMap = new Map<string, { type: TypeDefinitionNode, count: number }>();
        const validationMessages: ValidationMessage[] = [];
        ast.definitions.forEach(definition => {
            if (definition.kind === SCALAR_TYPE_DEFINITION ||
                definition.kind === INTERFACE_TYPE_DEFINITION ||
                definition.kind === OBJECT_TYPE_DEFINITION ||
                definition.kind === UNION_TYPE_DEFINITION ||
                definition.kind === ENUM_TYPE_DEFINITION ||
                definition.kind === INPUT_OBJECT_TYPE_DEFINITION) {
                const usedType = usedTypesMap.get(definition.name.value);
                if (usedType) {
                    validationMessages.push(ValidationMessage.error(VALIDATION_ERROR_DUPLICATE_TYPE_NAMES, {name: definition.name.value}, definition.name.loc));
                    if (usedType.count == 1) {
                        validationMessages.push(ValidationMessage.error(VALIDATION_ERROR_DUPLICATE_TYPE_NAMES, {name: usedType.type.name.value}, usedType.type.name.loc))
                    }
                    usedType.count++;
                } else {
                    usedTypesMap.set(definition.name.value, { type: definition, count: 1 })
                }
            }
        });
        return validationMessages;
    }
}
