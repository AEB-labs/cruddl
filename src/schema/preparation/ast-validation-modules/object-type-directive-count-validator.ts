import {ASTValidator} from "../ast-validator";
import {ValidationMessage} from "../validation-message";
import {DocumentNode, ObjectTypeDefinitionNode} from "graphql";
import {getObjectTypes} from "../../schema-utils";
import {flatMap} from "../../../utils/utils";
import {
    CHILD_ENTITY_DIRECTIVE,
    ENTITY_EXTENSION_DIRECTIVE,
    OBJECT_TYPE_ENTITY_DIRECTIVES,
    ROOT_ENTITY_DIRECTIVE,
    VALUE_OBJECT_DIRECTIVE
} from "../../schema-defaults";

export const VALIDATION_ERROR_MULTIPLE_OBJECT_TYPE_DIRECTIVES = `Only one of @${ROOT_ENTITY_DIRECTIVE}, @${CHILD_ENTITY_DIRECTIVE}, @${ENTITY_EXTENSION_DIRECTIVE} or @${VALUE_OBJECT_DIRECTIVE} can be used.`;
export const VALIDATION_ERROR_MISSING_OBJECT_TYPE_DIRECTIVE = `Add one of @${ROOT_ENTITY_DIRECTIVE}, @${CHILD_ENTITY_DIRECTIVE}, @${ENTITY_EXTENSION_DIRECTIVE} or @${VALUE_OBJECT_DIRECTIVE}.`;


export class ObjectTypeDirectiveCountValidator implements ASTValidator {

    validate(ast: DocumentNode): ValidationMessage[] {
        return flatMap(getObjectTypes(ast), obj => validateObjectType(obj));
    }
}

function validateObjectType(objectType: ObjectTypeDefinitionNode): ValidationMessage[] {
    const validationMessages: ValidationMessage[] = [];
    if (!objectType.directives) {
        return [];
    }
    let count = 0;
    objectType.directives.filter(directive => OBJECT_TYPE_ENTITY_DIRECTIVES.includes(directive.name.value)).forEach(directive => {
        count++;
        if (count > 1) {
            validationMessages.push(ValidationMessage.error(VALIDATION_ERROR_MULTIPLE_OBJECT_TYPE_DIRECTIVES, undefined, directive.loc));
            return;
        }
    });
    if (count === 0) {
        validationMessages.push(ValidationMessage.error(VALIDATION_ERROR_MISSING_OBJECT_TYPE_DIRECTIVE, undefined, objectType.name.loc))
    }
    return validationMessages;
}
