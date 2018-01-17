import { ASTTransformationContext, SchemaTransformer } from '../transformation-pipeline';
import { GraphQLField, GraphQLObjectType, GraphQLSchema, StringValueNode } from 'graphql';
import { findDirectiveWithName, getRoleListFromDirective, hasDirectiveWithName } from '../../schema-utils';
import {
    CHILD_ENTITY_DIRECTIVE, ENTITY_EXTENSION_DIRECTIVE,
    FIELD_DIRECTIVE, PERMISSION_PROFILE_ARG, ROLES_DIRECTIVE, ROLES_READ_ARG, ROLES_READ_WRITE_ARG,
    ROOT_ENTITY_DIRECTIVE, VALUE_OBJECT_DIRECTIVE
} from '../../schema-defaults';
import { filterType, flatMap, objectValues, pair } from '../../../utils/utils';
import { PermissionProfile } from '../../../authorization/permission-profile';
import {
    AlwaysGrantPermissionDescriptor, PermissionDescriptor, ProfileBasedPermissionDescriptor, StaticPermissionDescriptor
} from '../../../authorization/permission-descriptors';
import { setPermissionDescriptor } from '../../../authorization/permission-descriptors-in-schema';

export class AddPermissionDescriptorsTransformer implements SchemaTransformer {

    transform(schema: GraphQLSchema, context: ASTTransformationContext): GraphQLSchema {
        const objectTypes = filterType(objectValues(schema.getTypeMap()), GraphQLObjectType);
        const entityLikeDirectives = [ ROOT_ENTITY_DIRECTIVE, CHILD_ENTITY_DIRECTIVE, VALUE_OBJECT_DIRECTIVE, ENTITY_EXTENSION_DIRECTIVE ];
        const entityLikeTypes = objectTypes.filter(type => type.astNode && entityLikeDirectives.some(dir => hasDirectiveWithName(type.astNode!, dir)));
        const rootEntityTypes = entityLikeTypes.filter(type => type.astNode && hasDirectiveWithName(type.astNode, ROOT_ENTITY_DIRECTIVE));
        const fields: [GraphQLField<any, any>, GraphQLObjectType][] = // for some reason, TypeScript would infer "any" for the first array item type
            flatMap(entityLikeTypes, type => objectValues<GraphQLField<any, any>>(type.getFields()).map(field => pair(field, type)));

        for (const rootEntity of rootEntityTypes) {
            const descriptor = this.getPermissionDescriptorForRootEntity(rootEntity, context);
            setPermissionDescriptor(rootEntity, descriptor);
        }

        for (const [ field, type ] of fields) {
            const descriptor = this.getPermissionDescriptorForField(field, type, context);
            setPermissionDescriptor(field, descriptor);
        }

        return schema;
    }

    protected getPermissionDescriptorForRootEntity(objectType: GraphQLObjectType, context: ASTTransformationContext): PermissionDescriptor {
        const profile = this.getPermissionProfile(objectType, context, ROOT_ENTITY_DIRECTIVE);
        if (profile) {
            return new ProfileBasedPermissionDescriptor(profile, objectType);
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
        return new ProfileBasedPermissionDescriptor(defaultProfile, objectType);
    }

    protected getPermissionDescriptorForField(field: GraphQLField<any, any>, type: GraphQLObjectType, context: ASTTransformationContext): PermissionDescriptor {
        const profile = this.getPermissionProfile(field, context, FIELD_DIRECTIVE);
        if (profile) {
            return new ProfileBasedPermissionDescriptor(profile, type);
        }
        const legacyDescriptor = this.getLegacyDescriptor(field, context);
        if (legacyDescriptor) {
            return legacyDescriptor;
        }
        // fall back to "allow everything"
        return AlwaysGrantPermissionDescriptor.INSTANCE;
    }

    protected getPermissionProfile(node: GraphQLObjectType|GraphQLField<any, any>, context: ASTTransformationContext, directiveName: string): PermissionProfile|undefined {
        if (!node.astNode) {
            return undefined;
        }
        const dir = findDirectiveWithName(node.astNode, directiveName);
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
            const nodeDescriptor = node instanceof GraphQLObjectType ? `root entity ${node.name}` : `field ${node.name}`;
            throw new Error(`Permission profile ${profileName} referenced by root entity ${nodeDescriptor}, but not defined in permission profile map`);
        }
        return permissionProfile;
    }

    protected getLegacyDescriptor(node: GraphQLObjectType|GraphQLField<any, any>, context: ASTTransformationContext): PermissionDescriptor|undefined {
        if (!node.astNode) {
            return undefined;
        }
        const rolesDirective = findDirectiveWithName(node.astNode, ROLES_DIRECTIVE);
        if (!rolesDirective) {
            return undefined;
        }
        const readRoles = getRoleListFromDirective(rolesDirective, ROLES_READ_ARG);
        const readWriteRoles = getRoleListFromDirective(rolesDirective, ROLES_READ_WRITE_ARG);
        return new StaticPermissionDescriptor(readRoles, readWriteRoles);
    }

}
