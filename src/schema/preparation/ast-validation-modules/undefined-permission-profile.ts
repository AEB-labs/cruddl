import { ASTValidationContext, ASTValidator } from '../ast-validator';
import { DocumentNode, GraphQLString, TypeNode } from 'graphql';
import { ValidationMessage } from '../validation-message';
import {
    findDirectiveWithName, getNamedTypeDefinitionAST, getNodeByName, getRootEntityTypes
} from '../../schema-utils';
import { ACCESS_GROUP_FIELD, PERMISSION_PROFILE_ARG, ROOT_ENTITY_DIRECTIVE } from '../../schema-defaults';

export const VALIDATION_ERROR_INVALID_PERMISSION_PROFILE = `Invalid argument value, expected string`;
export const VALIDATION_ERROR_UNDEFINED_PERMISSION_PROFILE = `This permission profile is not defined`;
export const VALIDATION_ERROR_ACCESS_GROUP_FIELD_MISSING = `This permission profile requires an ${ACCESS_GROUP_FIELD} field on this root entity`;
export const VALIDATION_ERROR_ACCESS_GROUP_FIELD_WRONG_TYPE = `Must be String or an enum type to be used with the permissionProfile set for this rootEntity`;

export class UndefinedPermissionProfileValidator implements ASTValidator {
    validate(ast: DocumentNode, context: ASTValidationContext): ValidationMessage[] {
        const validationMessages: ValidationMessage[] = [];
            getRootEntityTypes(ast).forEach(rootEntity => {
                const rootEntityDirective = findDirectiveWithName(rootEntity, ROOT_ENTITY_DIRECTIVE);
                if (!rootEntityDirective) {
                    return;
                }
                const permissionProfileArg = getNodeByName(rootEntityDirective.arguments, PERMISSION_PROFILE_ARG);
                if (!permissionProfileArg) {
                    return;
                }
                if (permissionProfileArg.value.kind == 'NullValue') {
                    return;
                }

                if (permissionProfileArg.value.kind != 'StringValue') {
                    validationMessages.push(ValidationMessage.error(VALIDATION_ERROR_INVALID_PERMISSION_PROFILE, {}, permissionProfileArg.value.loc));
                    return;
                }

                const profileName = permissionProfileArg.value.value;
                if (!hasPermissionProfile(context, profileName)) {
                    validationMessages.push(ValidationMessage.error(VALIDATION_ERROR_UNDEFINED_PERMISSION_PROFILE, {profileName}, permissionProfileArg.value.loc));
                    return;
                }

                const permissionProfile = context.permissionProfiles![profileName];
                const usesAccessGroup = permissionProfile.permissions.some(per => !!per.restrictToAccessGroups);
                if (usesAccessGroup) {
                    const accessGroupField = rootEntity.fields.filter(field => field.name.value == ACCESS_GROUP_FIELD)[0];
                    if (!accessGroupField) {
                        validationMessages.push(ValidationMessage.error(VALIDATION_ERROR_ACCESS_GROUP_FIELD_MISSING, {profileName}, permissionProfileArg.value.loc));
                        return;
                    }
                    const type = accessGroupField.type;
                    if (!isAccessGroupTypeValid(type, ast)) {
                        validationMessages.push(ValidationMessage.error(VALIDATION_ERROR_ACCESS_GROUP_FIELD_WRONG_TYPE, {profileName}, type.loc));
                        return;
                    }
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

function isAccessGroupTypeValid(type: TypeNode, ast: DocumentNode): boolean {
    if (type.kind == 'NonNullType') {
        return isAccessGroupTypeValid(type.type, ast);
    }
    if (type.kind != 'NamedType') {
        return false;
    }
    if (type.name.value == GraphQLString.name) {
        return true;
    }
    const referencedType = getNamedTypeDefinitionAST(ast, type.name.value);
    if (!referencedType) {
        return false;
    }
    return referencedType.kind == 'EnumTypeDefinition';
}
