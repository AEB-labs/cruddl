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
    getChildEntityTypes,
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
    ENTITY_CREATED_AT, ENTITY_UPDATED_AT, ID_FIELD, PERMISSION_PROFILE_ARG, RELATION_DIRECTIVE, ROLES_DIRECTIVE,
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
    PermissionDescriptor, ProfileBasedPermissionDescriptor, StaticPermissionDescriptor
} from '../../../authorization/permission-descriptors';
import { setPermissionDescriptor } from '../../../authorization/permission-descriptors-in-schema';

export class AddPermissionDescriptorsTransformer implements ASTTransformer {

    transform(ast: DocumentNode, context: ASTTransformationContext): void {
        getRootEntityTypes(ast).forEach(objectType => {
            const descriptor = this.getPermissionDescriptor(objectType, context);
            setPermissionDescriptor(objectType, descriptor);
        });
    }

    protected getPermissionDescriptor(objectType: ObjectTypeDefinitionNode, context: ASTTransformationContext): PermissionDescriptor {
        const profile = this.getPermissionProfile(objectType, context);
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

    protected getPermissionProfile(objectType: ObjectTypeDefinitionNode, context: ASTTransformationContext): PermissionProfile|undefined {
        const dir = findDirectiveWithName(objectType, ROOT_ENTITY_DIRECTIVE)!;
        const permissionProfileArg = (dir.arguments || []).filter(arg => arg.name.value == PERMISSION_PROFILE_ARG)[0];
        if (!permissionProfileArg) {
            return undefined;
        }
        const profileName = (permissionProfileArg.value as StringValueNode).value;
        const permissionProfile = (context.permissionProfiles || {})[profileName];
        if (!permissionProfile) {
            throw new Error(`Permission profile ${profileName} referenced by root entity ${objectType.name.value}, but not defined in permission profile map`);
        }
        return permissionProfile;
    }

    protected getLegacyDescriptor(objectType: ObjectTypeDefinitionNode, context: ASTTransformationContext): PermissionDescriptor|undefined {
        const rolesDirective = findDirectiveWithName(objectType, ROLES_DIRECTIVE);
        if (!rolesDirective) {
            return undefined;
        }
        const readRoles = getRoleListFromDirective(rolesDirective, ROLES_READ_ARG);
        const readWriteRoles = getRoleListFromDirective(rolesDirective, ROLES_READ_WRITE_ARG);
        return new StaticPermissionDescriptor(readRoles, readWriteRoles);
    }

    protected createCreateInputTypeForObjectType(ast: DocumentNode, objectType: ObjectTypeDefinitionNode): InputObjectTypeDefinitionNode {
        // create input fields for all entity fields except ID, createdAt, updatedAt
        const skip = [ID_FIELD, ENTITY_CREATED_AT, ENTITY_UPDATED_AT];
        const args = [
            ...objectType.fields.filter(field => !skip.includes(field.name.value)).map(field => this.createInputTypeField(ast, field, field.type))
        ];
        return {
            kind: INPUT_OBJECT_TYPE_DEFINITION,
            name: { kind: "Name", value: getCreateInputTypeName(objectType) },
            fields: args,
            loc: objectType.loc,
            directives: compact([ findDirectiveWithName(objectType, ROLES_DIRECTIVE) ])
        }
    }

    protected createInputTypeField(ast: DocumentNode, field: FieldDefinitionNode, type: TypeNode): InputValueDefinitionNode {
        switch (type.kind) {
            case NON_NULL_TYPE:
                return this.createInputTypeField(ast, field, type.type);
            case NAMED_TYPE:
                return buildInputFieldFromNonListField(ast, field, type);
            case LIST_TYPE:
                const effectiveType = type.type.kind === NON_NULL_TYPE ? type.type.type : type.type;
                if (effectiveType.kind === LIST_TYPE) {
                    throw new Error('Lists of lists are not allowed.');
                }
                const namedTypeOfList = getNamedTypeDefinitionAST(ast, effectiveType.name.value);
                if (namedTypeOfList.kind === OBJECT_TYPE_DEFINITION) {
                    // relations are referenced via IDs
                    if (hasDirectiveWithName(field, RELATION_DIRECTIVE)) {
                        return buildInputValueListNodeFromField(field.name.value, GraphQLID.name, field)
                    }
                    return buildInputValueListNodeFromField(field.name.value, getCreateInputTypeName(namedTypeOfList), field)
                } else {
                    return buildInputValueListNodeFromField(field.name.value, effectiveType.name.value, field);
                }
        }
    }

}


