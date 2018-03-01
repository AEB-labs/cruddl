import { ASTValidationContext, ASTValidator } from '../ast-validator';
import { ArgumentNode, DocumentNode } from 'graphql';
import { ValidationMessage } from '../validation-message';
import { findDirectiveWithName, getNodeByName, getRootEntityTypes } from '../../schema-utils';
import { ROLES_DIRECTIVE, ROLES_READ_ARG, ROLES_READ_WRITE_ARG } from '../../schema-defaults';
import { LIST, STRING } from '../../../graphql/kinds';

export const VALIDATION_WARNING_MISSING_ROLE_ON_ROOT_ENTITY = 'No roles with read access are specified for this root entity, access is denied for everyone';
export const VALIDATION_ERROR_MISSING_ROLE_ON_ROOT_ENTITY_ILLEGAL_ARGUMENT_TYPE = 'Invalid argument type. Only String and list of Strings are allowed.';

export class RootEntitiesWithoutReadRolesValidator implements ASTValidator {
    validate(ast: DocumentNode): ValidationMessage[] {
        const validationMessages: ValidationMessage[] = [];
            getRootEntityTypes(ast).forEach(rootEntity => {
                const rolesDirective =  findDirectiveWithName(rootEntity, ROLES_DIRECTIVE);
                if (!rolesDirective) {
                    // no-permission-profile handles this case
                    return;
                }

                if (!rolesDirective.arguments) {
                    validationMessages.push(ValidationMessage.warn(VALIDATION_WARNING_MISSING_ROLE_ON_ROOT_ENTITY, {}, !!rolesDirective ? rolesDirective.loc : rootEntity.loc))
                } else {
                    const readArg = getNodeByName(rolesDirective.arguments, ROLES_READ_ARG);
                    const readWriteArg = getNodeByName(rolesDirective.arguments, ROLES_READ_WRITE_ARG);
                    const readArgResult = checkArgPresent(readArg);
                    if (readArgResult.validationMessage) {
                        validationMessages.push(readArgResult.validationMessage);
                    }
                    const readWriteArgResult = checkArgPresent(readWriteArg);
                    if (readWriteArgResult.validationMessage) {
                        validationMessages.push(readWriteArgResult.validationMessage);
                    }
                    if (!readArgResult.result && !readWriteArgResult.result && !readArgResult.validationMessage && !readWriteArgResult.validationMessage) {
                        validationMessages.push(ValidationMessage.warn(VALIDATION_WARNING_MISSING_ROLE_ON_ROOT_ENTITY, {}, rolesDirective.loc))
                    }
                }
            });
        return validationMessages;
    }

}

function checkArgPresent(arg: ArgumentNode|undefined): {result: boolean, validationMessage?: ValidationMessage} {
    if (!arg || !arg.value) {
        return { result: false };
    }
    switch (arg.value.kind) {
        case STRING:
            if (!!arg.value.value) {
                return { result: true };
            } else {
                return { result: false, validationMessage: ValidationMessage.warn(VALIDATION_WARNING_MISSING_ROLE_ON_ROOT_ENTITY, {}, arg.value.loc) };
            }
        case LIST:
            if (arg.value.values.some(val => !!val)) {
                return { result: true };
            } else {
                return { result: false, validationMessage: ValidationMessage.warn(VALIDATION_WARNING_MISSING_ROLE_ON_ROOT_ENTITY, {}, arg.value.loc) };
            }
        default:
            return { result: false, validationMessage: ValidationMessage.error(VALIDATION_ERROR_MISSING_ROLE_ON_ROOT_ENTITY_ILLEGAL_ARGUMENT_TYPE, {}, arg.value.loc) };
    }
}
