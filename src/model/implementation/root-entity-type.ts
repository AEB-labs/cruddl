import { GraphQLID, GraphQLString } from 'graphql';
import memorize from 'memorize-decorator';
import { ACCESS_GROUP_FIELD, DEFAULT_PERMISSION_PROFILE, ID_FIELD, SCALAR_INT, SCALAR_STRING } from '../../schema/constants';
import { compact, flatMap } from '../../utils/utils';
import {
    ArangoSearchIndexConfig,
    FieldConfig,
    IndexDefinitionConfig,
    PermissionsConfig,
    RootEntityTypeConfig,
    TypeKind
} from '../config';
import { ValidationMessage } from '../validation';
import { ValidationContext } from '../validation/validation-context';
import { Field, SystemFieldConfig } from './field';
import { Index } from './indices';
import { Model } from './model';
import { ObjectTypeBase } from './object-type-base';
import { PermissionProfile } from './permission-profile';
import { Relation, RelationSide } from './relation';
import { RolesSpecifier } from './roles-specifier';
import { ScalarType } from './scalar-type';

export class RootEntityType extends ObjectTypeBase {
    private readonly permissions: PermissionsConfig & {};
    readonly roles: RolesSpecifier | undefined;

    readonly kind: TypeKind.ROOT_ENTITY = TypeKind.ROOT_ENTITY;
    readonly isChildEntityType: false = false;
    readonly isRootEntityType: true = true;
    readonly isEntityExtensionType: false = false;
    readonly isValueObjectType: false = false;

    constructor(private readonly input: RootEntityTypeConfig, model: Model) {
        super(input, model, systemFieldInputs);
        this.permissions = input.permissions || {};
        this.roles = input.permissions && input.permissions.roles ? new RolesSpecifier(input.permissions.roles) : undefined;
    }

    @memorize()
    get indices(): ReadonlyArray<Index> {
        const indexConfigs = this.input.indices ? [...this.input.indices] : [];

        // @key implies a unique index
        // (do this to the inputs so that addIdentifyingSuffixIfNeeded is called on these, too)
        if (this.keyField) {
            const keyField = this.keyField;
            if (!indexConfigs.some(f => f.unique === true && f.fields.length == 1 && f.fields[0] === keyField.name)) {
                indexConfigs.push({ unique: true, fields: [keyField.name] });
            }
        }

        const indices = indexConfigs.map(config => new Index(config, this));

        if (this.discriminatorField !== this.keyField) {
            if (!indices.some(index => index.fields.length === 1 && index.fields[0].field === this.discriminatorField)) {
                // make sure there is an index on the discriminator field that can be used for sorting
                // arangodb already has an index on 'id', but it's a hash index which is unusable for sorting
                // if the discriminator field is the key field, we already added an index above.
                // don't use unique to avoid running into performance workarounds for unique indices (sparseness)
                indices.push(new Index({
                    fields: [this.discriminatorField.name]
                }, this));
            }
        }

        // deduplicate indices
        return indices.filter((index, i1) => !indices.some((other, i2) => i1 < i2 && other.equals(index)));
    }

    @memorize()
    get arangoSearchConfig(): ArangoSearchIndexConfig {
        return this.input.arangoSearchIndex || {
            isIndexed: false
        };
    }

    @memorize()
    get keyField(): Field | undefined {
        if (!this.input.keyFieldName) {
            return undefined;
        }
        const field = this.getField(this.input.keyFieldName);
        if (!field || field.isList) {
            return undefined;
        }
        return field;
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

    /**
     * Gets a field that is guaranteed to be unique, to be used for absolute order
     */
    @memorize()
    get discriminatorField(): Field {
        // later, we can return @key here when it exists and is required
        return this.getFieldOrThrow(ID_FIELD);
    }

    get permissionProfile(): PermissionProfile | undefined {
        if (this.permissions.permissionProfileName == undefined) {
            if (this.permissions.roles != undefined) {
                // if @roles is specified, this root entity explicitly does not have a permission profile
                return undefined;
            }
            return this.namespace.defaultPermissionProfile;
        }
        return this.namespace.getPermissionProfile(this.permissions.permissionProfileName);
    }

    /**
     * A list of all relations that have a field in this type
     *
     * (as opposed to the relation only existing because a different type has a relation field to this root entity)
     */
    get explicitRelations(): ReadonlyArray<Relation> {
        return compact(this.fields.map(field => field.relation));
    }

    /**
     * A list of all relations concerning this type, regardless of whether there is a field on this type for it
     */
    @memorize()
    get relations(): ReadonlyArray<Relation> {
        return this.model.relations.filter(rel => rel.fromType === this || rel.toType === this);
    }

    /**
     * A list of all relations sides concerning this type, regardless of whether there is a field on this type for it
     */
    @memorize()
    get relationSides(): ReadonlyArray<RelationSide> {
        return [
            ...this.model.relations.filter(rel => rel.fromType === this).map(rel => rel.fromSide),
            ...this.model.relations.filter(rel => rel.toType === this).map(rel => rel.toSide)
        ];
    }

    validate(context: ValidationContext) {
        super.validate(context);

        this.validateKeyField(context);
        this.validatePermissions(context);
        this.validateIndices(context);
        this.validateQuickSearch(context);
    }

    private validateKeyField(context: ValidationContext) {
        if (this.input.keyFieldName == undefined) {
            return;
        }
        const astNode = this.input.keyFieldASTNode || this.astNode;

        const field = this.getField(this.input.keyFieldName);

        if (!field) {
            context.addMessage(ValidationMessage.error(`Field "${this.input.keyFieldName}" does not exist on type "${this.name}".`, astNode));
            return;
        }

        // support for ID is needed because id: ID @key is possible
        if (field.type.kind !== TypeKind.SCALAR || !(field.type.name === SCALAR_INT || field.type.name === SCALAR_STRING || field.type.name === GraphQLID.name)) {
            context.addMessage(ValidationMessage.error(`Only fields of type "String", "Int", and "ID" can be used as key field.`, astNode));
        }

        if (field.isList) {
            context.addMessage(ValidationMessage.error(`List fields cannot be used as key field.`, astNode));
        }
    }

    private validatePermissions(context: ValidationContext) {
        const permissions = this.permissions;
        if (permissions.permissionProfileName != undefined && permissions.roles != undefined) {
            const message = `Permission profile and explicit role specifiers cannot be combined.`;
            context.addMessage(ValidationMessage.error(message, permissions.permissionProfileNameAstNode || this.nameASTNode));
            context.addMessage(ValidationMessage.error(message, permissions.roles.astNode || this.nameASTNode));
        }

        if (permissions.permissionProfileName != undefined && !this.namespace.getPermissionProfile(permissions.permissionProfileName)) {
            context.addMessage(ValidationMessage.error(`Permission profile "${permissions.permissionProfileName}" not found.`, permissions.permissionProfileNameAstNode || this.nameASTNode));
        }

        if (permissions.permissionProfileName == undefined && permissions.roles == undefined && this.namespace.defaultPermissionProfile == undefined) {
            context.addMessage(ValidationMessage.error(`No permissions specified for root entity "${this.name}". Specify "permissionProfile" in @rootEntity, use the @roles directive, or add a permission profile with the name "${DEFAULT_PERMISSION_PROFILE}".`, permissions.permissionProfileNameAstNode || this.nameASTNode));
        }

        if (this.roles) {
            this.roles.validate(context);
        }

        const usesAccessGroup = this.permissionProfile && this.permissionProfile.permissions.some(per => !!per.restrictToAccessGroups);
        if (usesAccessGroup) {
            const accessGroupField = this.getField(ACCESS_GROUP_FIELD);
            if (!accessGroupField) {
                context.addMessage(ValidationMessage.error(`The permission profile "${permissions.permissionProfileName}" uses "restrictToAccessGroups", but this root entity does not have a "${ACCESS_GROUP_FIELD}" field.`, permissions.permissionProfileNameAstNode || this.nameASTNode));
            } else if (!accessGroupField.type.isEnumType && accessGroupField.type.name !== GraphQLString.name) {
                context.addMessage(ValidationMessage.error(`This field must be of String or enum type to be used as "accessGroup" with the permission profile "${permissions.permissionProfileName}".`, accessGroupField.astNode || this.nameASTNode));
            }
        }
    }

    private validateIndices(context: ValidationContext) {
        // validate the "raw" indices without our magic additions like adding the id field
        for (const indexInput of this.input.indices || []) {
            const index = new Index(indexInput, this);
            index.validate(context);
        }
    }

    private validateQuickSearch(context: ValidationContext) {
        if (!this.arangoSearchConfig.isIndexed && this.fields.some(value => (value.isQuickSearchIndexed || value.isQuickSearchFulltextIndexed) && !value.isSystemField)) {
            context.addMessage(ValidationMessage.warn(
                `The entity contains fields that are quickSearchIndexed or quickSearchFulltextIndexed, but the entity itself is not marked as quickSearchIndexed.`,
                this.input.astNode
            ));
        }
    }
}

const systemFieldInputs: ReadonlyArray<SystemFieldConfig> = [
    {
        name: 'id',
        typeName: 'ID',
        isNonNull: true,
        description: 'An auto-generated string that identifies this root entity uniquely among others of the same type',
        isQuickSearchIndexed: true,
        isQuickSearchFulltextIndexed: false,
        isIncludedInSearch: false
    }, {
        name: 'createdAt',
        typeName: 'DateTime',
        isNonNull: true,
        description: 'The instant this object has been created',
        isQuickSearchIndexed: true,
        isQuickSearchFulltextIndexed: false,
        isIncludedInSearch: false
    }, {
        name: 'updatedAt',
        typeName: 'DateTime',
        isNonNull: true,
        description: 'The instant this object has been updated the last time (not including relation updates)',
        isQuickSearchIndexed: true,
        isQuickSearchFulltextIndexed: false,
        isIncludedInSearch: false
    }
];
