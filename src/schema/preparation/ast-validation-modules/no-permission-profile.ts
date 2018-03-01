import { ASTValidationContext, ASTValidator } from '../ast-validator';
import { ArgumentNode, DocumentNode } from 'graphql';
import { ValidationMessage } from '../validation-message';
import { findDirectiveWithName, getNodeByName, getRootEntityTypes } from '../../schema-utils';
import {
    DEFAULT_PERMISSION_PROFILE,
    PERMISSION_PROFILE_ARG, ROLES_DIRECTIVE, ROLES_READ_ARG, ROLES_READ_WRITE_ARG, ROOT_ENTITY_DIRECTIVE
} from '../../schema-defaults';
import { LIST, STRING } from '../../../graphql/kinds';

export const VALIDATION_ERROR_NO_PERMISSION_PROFILE = `No ${DEFAULT_PERMISSION_PROFILE} permission profile defined. Either specify permissionProfile in @rootEntity or use @roles directive`;

export class NoPermissionProfileValidator implements ASTValidator {
    validate(ast: DocumentNode, context: ASTValidationContext): ValidationMessage[] {
        const validationMessages: ValidationMessage[] = [];
            getRootEntityTypes(ast).forEach(rootEntity => {
                if (findDirectiveWithName(rootEntity, ROLES_DIRECTIVE)) {
                    // if @roles is specified, no need for permission profile
                    return;
                }

                if (hasPermissionProfile(context, DEFAULT_PERMISSION_PROFILE)) {
                    // there is a default permission profile defined
                    return;
                }

                const rootEntityDirective = findDirectiveWithName(rootEntity, ROOT_ENTITY_DIRECTIVE);
                const permissionProfileArg = rootEntityDirective ? getNodeByName(rootEntityDirective.arguments, PERMISSION_PROFILE_ARG) : undefined;
                if (!permissionProfileArg || permissionProfileArg.value.kind == 'NullValue') {
                    validationMessages.push(ValidationMessage.error(VALIDATION_ERROR_NO_PERMISSION_PROFILE, {}, rootEntity.name.loc));
                }
            });
        return validationMessages;
    }
}

function hasPermissionProfile(context: ASTValidationContext, name: string) {
    if (!context.permissionProfiles) {
        return false;
    }
    return name in context.permissionProfiles;
}
