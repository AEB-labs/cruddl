import { FieldConfig, PermissionsConfig, RootEntityTypeConfig, TypeKind } from '../config';
import { ObjectTypeBase } from './object-type-base';
import { Field } from './field';
import { Model } from './model';
import { ScalarType } from './scalar-type';
import { ValidationContext } from './validation';
import { ValidationMessage } from '../validation';
import { Index } from './indices';
import { ACCESS_GROUP_FIELD, DEFAULT_PERMISSION_PROFILE } from '../../schema/constants';
import { PermissionProfile } from './permission-profile';
import { Relation } from './relation';
import { GraphQLString } from 'graphql';
import { RolesSpecifier } from './roles-specifier';
import { compact } from '../../utils/utils';
import { Namespace } from './namespace';

export class RootEntityType extends ObjectTypeBase {
    private readonly permissions: PermissionsConfig & {};
    readonly keyField: Field|undefined;
    readonly namespacePath: ReadonlyArray<string>;
    readonly indices: ReadonlyArray<Index>;
    readonly roles: RolesSpecifier|undefined;

    readonly kind: TypeKind.ROOT_ENTITY = TypeKind.ROOT_ENTITY;
    readonly isChildEntityType: false = false;
    readonly isRootEntityType: true = true;
    readonly isEntityExtensionType: false = false;
    readonly isValueObjectType: false = false;

    constructor(private readonly input: RootEntityTypeConfig, model: Model) {
        super(input, model, systemFieldInputs);
        this.keyField = input.keyFieldName != undefined ? this.getField(input.keyFieldName) : undefined;
        this.namespacePath = input.namespacePath || [];
        this.indices = (input.indices || []).map(index => new Index(index, this));
        this.permissions = input.permissions || {};
        this.roles = input.permissions && input.permissions.roles ? new RolesSpecifier(input.permissions.roles) : undefined;
    }

    getKeyFieldOrThrow(): Field {
        if (!this.keyField) {
            throw new Error(`Expected "${this.name}" to have a key field`);
        }
        return this.keyField;
    }

    getKeyFieldTypeOrThrow(): ScalarType {
        const field = this.getKeyFieldOrThrow();
        if (!field.type.isScalarType) {
            throw new Error(`Expected "${this.name}.${field.name}" to be of scalar type because it is a key field`);
        }
        return field.type;
    }

    get permissionProfile(): PermissionProfile|undefined {
        if (this.permissions.permissionProfileName == undefined) {
            if (this.permissions.roles != undefined) {
                // if @roles is specified, this root entity explicitly does not have a permission profile
                return undefined;
            }
            return this.model.defaultPermissionProfile;
        }
        return this.model.getPermissionProfile(this.permissions.permissionProfileName);
    }

    get relations(): ReadonlyArray<Relation> {
        return compact(this.fields.map(field => field.relation));
    }

    get namespace(): Namespace | undefined {
        return this.model.getNamespaceByPath(this.namespacePath);
    }

    validate(context: ValidationContext) {
        super.validate(context);

        this.validateKeyField(context);
        this.validatePermissions(context);

        for (const index of this.indices) {
            index.validate(context);
        }
    }

    private validateKeyField(context: ValidationContext) {
        if (this.input.keyFieldName == undefined) {
            return;
        }
        const astNode = this.input.keyFieldASTNode || this.astNode;

        const field = this.getField(this.input.keyFieldName);

        if (!field) {
            context.addMessage(ValidationMessage.error(`Field "${this.input.keyFieldName}" does not exist on type "${this.name}".`, undefined, astNode));
            return;
        }

        if (field.type.kind !== TypeKind.SCALAR) {
            context.addMessage(ValidationMessage.error(`Only fields of scalar type can be used as key field.`, undefined, astNode));
        }

        if (field.isList) {
            context.addMessage(ValidationMessage.error(`List fields cannot be used as key field.`, undefined, astNode));
        }
    }

    private validatePermissions(context: ValidationContext) {
        const permissions = this.permissions;
        if (permissions.permissionProfileName != undefined && permissions.roles != undefined) {
            const message = `Permission profile and explicit role specifiers cannot be combined.`;
            context.addMessage(ValidationMessage.error(message, undefined, permissions.permissionProfileNameAstNode || this.input.astNode ));
            context.addMessage(ValidationMessage.error(message, undefined, permissions.roles.astNode || this.input.astNode ));
        }

        if (permissions.permissionProfileName != undefined && !this.model.getPermissionProfile(permissions.permissionProfileName)) {
            context.addMessage(ValidationMessage.error(`Permission profile "${permissions.permissionProfileName}" not found.`, undefined, permissions.permissionProfileNameAstNode || this.input.astNode ));
        }

        if (permissions.permissionProfileName == undefined && permissions.roles == undefined && this.model.defaultPermissionProfile == undefined) {
            context.addMessage(ValidationMessage.error(`No permissions specified for root entity "${this.name}". Specify "permissionProfile" in @rootEntity, use the @roles directive, or add a permission profile with the name "${DEFAULT_PERMISSION_PROFILE}".`, undefined, permissions.permissionProfileNameAstNode || this.input.astNode ));
        }

        if (this.roles) {
            this.roles.validate(context);
        }

        const usesAccessGroup = this.permissionProfile && this.permissionProfile.permissions.some(per => !!per.restrictToAccessGroups);
        if (usesAccessGroup) {
            const accessGroupField = this.getField(ACCESS_GROUP_FIELD);
            if (!accessGroupField) {
                context.addMessage(ValidationMessage.error(`The permission profile "${permissions.permissionProfileName}" uses "restrictToAccessGroups", but this root entity does not have a "${ACCESS_GROUP_FIELD}" field.`, undefined, permissions.permissionProfileNameAstNode || this.astNode));
            } else if (!accessGroupField.type.isEnumType && accessGroupField.type.name !== GraphQLString.name) {
                context.addMessage(ValidationMessage.error(`This field must be of String or enum type to be used as "accessGroup" with the permission profile "${permissions.permissionProfileName}".`, undefined, accessGroupField.astNode || this.astNode));
            }
        }
    }
}

const systemFieldInputs: FieldConfig[] = [
    {
        name: 'id',
        typeName: 'ID'
    }, {
        name: 'createdAt',
        typeName: 'DateTime'
    }, {
        name: 'updatedAt',
        typeName: 'DateTime'
    }
];
