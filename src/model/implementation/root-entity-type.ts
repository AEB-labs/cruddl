import { FieldInput, RootEntityTypeInput, TypeKind } from '../input';
import { ObjectTypeBase } from './object-type-base';
import { Field, RolesSpecifier } from './field';
import { Model } from './model';
import { ValidationContext } from './validation';
import { ValidationMessage } from '../validation';
import { Index } from './indices';
import { DEFAULT_PERMISSION_PROFILE } from '../../schema/schema-defaults';
import { PermissionProfile } from '../../authorization/permission-profile';
import { PermissionsInput } from '../input/permissions';

export class RootEntityType extends ObjectTypeBase {
    private readonly permissions: PermissionsInput & {};
    readonly keyField: Field|undefined;
    readonly namespacePath: ReadonlyArray<string>;
    readonly indices: ReadonlyArray<Index>;
    readonly roles: RolesSpecifier|undefined;

    readonly kind: TypeKind.ROOT_ENTITY = TypeKind.ROOT_ENTITY;

    constructor(private readonly input: RootEntityTypeInput, model: Model) {
        super(input, model, systemFieldInputs);
        this.keyField = input.keyFieldName != undefined ? this.getField(input.keyFieldName) : undefined;
        this.namespacePath = input.namespacePath || [];
        this.indices = (input.indices || []).map(index => new Index(index, this));
        this.permissions = input.permissions || {};
        this.roles = input.permissions && input.permissions.roles ? {
            read: input.permissions.roles.read || [],
            readWrite: input.permissions.roles.readWrite || [],
        } : undefined;
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
            context.addMessage(ValidationMessage.error(`List fields can not be used as key field.`, undefined, astNode));
        }
    }

    private validatePermissions(context: ValidationContext) {
        const permissions = this.permissions;
        if (permissions.permissionProfileName != undefined && permissions.roles != undefined) {
            const message = `Permission profile and explicit role specifiers cannot be combined.`;
            context.addMessage(ValidationMessage.error(message, undefined, permissions.permissionProfileNameAstNode || this.input.astNode ));
            context.addMessage(ValidationMessage.error(message, undefined, permissions.rolesASTNode || this.input.astNode ));
        }

        if (permissions.permissionProfileName != undefined && !this.model.getPermissionProfile(permissions.permissionProfileName)) {
            context.addMessage(ValidationMessage.error(`Permission profile "${permissions.permissionProfileName}" not found.`, undefined, permissions.permissionProfileNameAstNode || this.input.astNode ));
        }

        if (permissions.permissionProfileName == undefined && permissions.roles == undefined && this.model.defaultPermissionProfile == undefined) {
            context.addMessage(ValidationMessage.error(`No ${DEFAULT_PERMISSION_PROFILE} permission profile defined. Either specify permissionProfile in @rootEntity or use the @roles directive.`, undefined, permissions.permissionProfileNameAstNode || this.input.astNode ));
        }

        if (this.roles && this.roles.read.length === 0 && this.roles.readWrite.length === 0) {
            context.addMessage(ValidationMessage.warn(`No roles with read access are specified. Access is denied for everyone.`, undefined, permissions.rolesASTNode || this.astNode ));
        }
    }
}

const systemFieldInputs: FieldInput[] = [
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
