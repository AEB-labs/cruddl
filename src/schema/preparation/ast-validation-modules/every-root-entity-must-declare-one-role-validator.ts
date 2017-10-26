import {ASTValidator} from "../ast-validator";
import {DocumentNode} from "graphql";
import {ValidationMessage} from "../validation-message";
import {findDirectiveWithName, getNodeByName, getRootEntityTypes} from "../../schema-utils";
import {ROLES_DIRECTIVE, ROLES_READ_ARG, ROLES_READ_WRITE_ARG} from "../../schema-defaults";
import {STRING} from "graphql/language/kinds";

export const VALIDATION_ERROR_MISSING_ROLE_ON_ROOT_ENTITY = 'Every root entity must at least have one role which is allowed to access the entity.'

export class EveryRootEntityMustDeclareOneRoleValidator implements ASTValidator {
    validate(ast: DocumentNode): ValidationMessage[] {
        const validationMessages: ValidationMessage[] = [];
            getRootEntityTypes(ast).forEach(rootEntity => {
                const rolesDirective =  findDirectiveWithName(rootEntity, ROLES_DIRECTIVE);
                if (!rolesDirective || !rolesDirective.arguments) {
                    validationMessages.push(ValidationMessage.error(VALIDATION_ERROR_MISSING_ROLE_ON_ROOT_ENTITY))
                } else {
                    const readArg = getNodeByName(rolesDirective.arguments, ROLES_READ_ARG);
                    const readWriteArg = getNodeByName(rolesDirective.arguments, ROLES_READ_WRITE_ARG);
                    if ((!readArg || !readArg.value || readArg.value.kind !== STRING || !readArg.value.value) &&
                        (!readWriteArg || !readWriteArg.value || readWriteArg.value.kind !== STRING || !readWriteArg.value.value)) {
                        validationMessages.push(ValidationMessage.error(VALIDATION_ERROR_MISSING_ROLE_ON_ROOT_ENTITY))
                    }
                }
            });
        return validationMessages;
    }

}