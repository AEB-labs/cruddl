import { ASTTransformationContext, ASTTransformer } from '../transformation-pipeline';
import {
    DocumentNode,
    FieldDefinitionNode,
    GraphQLID,
    InputObjectTypeDefinitionNode,
    InputValueDefinitionNode,
    ObjectTypeDefinitionNode, StringValueNode,
    TypeNode
} from 'graphql';
import {
    findDirectiveWithName, getAllowedReadRoles,
    getChildEntityTypes, getFieldDefinitionNodes,
    getNamedTypeDefinitionAST, getRoleListFromDirective,
    getRootEntityTypes,
    hasDirectiveWithName
} from '../../schema-utils';
import {
    INPUT_OBJECT_TYPE_DEFINITION,
    LIST_TYPE,
    NAMED_TYPE,
    NON_NULL_TYPE,
    OBJECT_TYPE_DEFINITION
} from 'graphql/language/kinds';
import {getCreateInputTypeName} from '../../../graphql/names';
import {
    ENTITY_CREATED_AT, ENTITY_UPDATED_AT, FIELD_DIRECTIVE, ID_FIELD, PERMISSION_PROFILE_ARG, RELATION_DIRECTIVE,
    ROLES_DIRECTIVE,
    ROLES_READ_ARG, ROLES_READ_WRITE_ARG,
    ROOT_ENTITY_DIRECTIVE
} from '../../schema-defaults';
import {
    buildInputFieldFromNonListField,
    buildInputValueListNodeFromField
} from './add-input-type-transformation-helper-transformer';
import { compact } from '../../../utils/utils';
import { PermissionProfile } from '../../../authorization/permission-profile';
import {
    AlwaysGrantPermissionDescriptor,
    PermissionDescriptor, ProfileBasedPermissionDescriptor, StaticPermissionDescriptor
} from '../../../authorization/permission-descriptors';
import { setPermissionDescriptor } from '../../../authorization/permission-descriptors-in-schema';

export class AddPermissionDescriptorsTransformer implements ASTTransformer {

    transform(ast: DocumentNode, context: ASTTransformationContext): void {
        getRootEntityTypes(ast).forEach(objectType => {
            const descriptor = this.getPermissionDescriptorForRootEntity(objectType, context);
            setPermissionDescriptor(objectType, descriptor);
        });
        getFieldDefinitionNodes(ast).forEach(field => {
            const descriptor = this.getPermissionDescriptorForField(field, context);
            setPermissionDescriptor(field, descriptor);
        });
    }

    protected getPermissionDescriptorForRootEntity(objectType: ObjectTypeDefinitionNode, context: ASTTransformationContext): PermissionDescriptor {
        const profile = this.getPermissionProfile(objectType, context, ROOT_ENTITY_DIRECTIVE);
        if (profile) {
            return new ProfileBasedPermissionDescriptor(profile);
        }
        const legacyDescriptor = this.getLegacyDescriptor(objectType, context);
        if (legacyDescriptor) {
            return legacyDescriptor;
        }
        // fall back to default
        const defaultProfile = (context.permissionProfiles || {})['default'];
        if (!defaultProfile) {
            throw new Error(`default permission profile missing`);
        }
        return new ProfileBasedPermissionDescriptor(defaultProfile);
    }

    protected getPermissionDescriptorForField(field: FieldDefinitionNode, context: ASTTransformationContext): PermissionDescriptor {
        const profile = this.getPermissionProfile(field, context, FIELD_DIRECTIVE);
        if (profile) {
            return new ProfileBasedPermissionDescriptor(profile);
        }
        const legacyDescriptor = this.getLegacyDescriptor(field, context);
        if (legacyDescriptor) {
            return legacyDescriptor;
        }
        // fall back to "allow everything"
        return AlwaysGrantPermissionDescriptor.INSTANCE;
    }

    protected getPermissionProfile(node: ObjectTypeDefinitionNode|FieldDefinitionNode, context: ASTTransformationContext, directiveName: string): PermissionProfile|undefined {
        const dir = findDirectiveWithName(node, directiveName);
        if (!dir) {
            return undefined;
        }
        const permissionProfileArg = (dir.arguments || []).filter(arg => arg.name.value == PERMISSION_PROFILE_ARG)[0];
        if (!permissionProfileArg) {
            return undefined;
        }
        const profileName = (permissionProfileArg.value as StringValueNode).value;
        const permissionProfile = (context.permissionProfiles || {})[profileName];
        if (!permissionProfile) {
            throw new Error(`Permission profile ${profileName} referenced by root entity ${node.name.value}, but not defined in permission profile map`);
        }
        return permissionProfile;
    }

    protected getLegacyDescriptor(node: ObjectTypeDefinitionNode|FieldDefinitionNode, context: ASTTransformationContext): PermissionDescriptor|undefined {
        const rolesDirective = findDirectiveWithName(node, ROLES_DIRECTIVE);
        if (!rolesDirective) {
            return undefined;
        }
        const readRoles = getRoleListFromDirective(rolesDirective, ROLES_READ_ARG);
        const readWriteRoles = getRoleListFromDirective(rolesDirective, ROLES_READ_WRITE_ARG);
        return new StaticPermissionDescriptor(readRoles, readWriteRoles);
    }

}

