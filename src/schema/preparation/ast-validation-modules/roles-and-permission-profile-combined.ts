import { ASTValidationContext, ASTValidator } from '../ast-validator';
import { ArgumentNode, DocumentNode } from 'graphql';
import { ValidationMessage } from '../../../model/validation/message';
import { findDirectiveWithName, getNodeByName, getRootEntityTypes } from '../../schema-utils';
import {
    DEFAULT_PERMISSION_PROFILE,
    PERMISSION_PROFILE_ARG, ROLES_DIRECTIVE, ROLES_READ_ARG, ROLES_READ_WRITE_ARG, ROOT_ENTITY_DIRECTIVE
} from '../../schema-defaults';
import { LIST, STRING } from '../../../graphql/kinds';

export const VALIDATION_ERROR_ROLES_AND_PERMISSION_PROFILE_COMBINED = '@roles can not be used if permissionProfile is set in @rootEntity';

export class RolesAndPermissionProfileCombinedValidator implements ASTValidator {
    validate(ast: DocumentNode): ValidationMessage[] {
        const validationMessages: ValidationMessage[] = [];
            getRootEntityTypes(ast).forEach(rootEntity => {
                const rootEntityDirective = findDirectiveWithName(rootEntity, ROOT_ENTITY_DIRECTIVE);
                const permissionProfileArg = rootEntityDirective ? getNodeByName(rootEntityDirective.arguments, PERMISSION_PROFILE_ARG) : undefined;
                const rolesDirective =  findDirectiveWithName(rootEntity, ROLES_DIRECTIVE);

                if (permissionProfileArg && rolesDirective) {
                    validationMessages.push(ValidationMessage.error(VALIDATION_ERROR_ROLES_AND_PERMISSION_PROFILE_COMBINED, {}, rolesDirective.loc));
                    return;
                }
            });
        return validationMessages;
    }

}
