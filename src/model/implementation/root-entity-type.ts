import { GraphQLID, GraphQLString } from 'graphql';
import memorize from 'memorize-decorator';
import {
    ACCESS_FIELD_DIRECTIVE,
    ACCESS_GROUP_FIELD,
    ENTITY_CREATED_AT,
    FLEX_SEARCH_FULLTEXT_INDEXED_DIRECTIVE,
    FLEX_SEARCH_INDEXED_DIRECTIVE,
    ID_FIELD,
    MODULES_DIRECTIVE,
    SCALAR_INT,
    SCALAR_STRING,
} from '../../schema/constants';
import { GraphQLInt53 } from '../../schema/scalars/int53';
import { GraphQLLocalDate } from '../../schema/scalars/local-date';
import { compact } from '../../utils/utils';
import {
    FlexSearchPerformanceParams,
    FlexSearchPrimarySortClauseConfig,
    PermissionsConfig,
    RootEntityTypeConfig,
    TypeKind,
} from '../config';
import { ValidationContext, ValidationMessage } from '../validation';
import { Field, SystemFieldConfig } from './field';
import { FieldPath } from './field-path';
import { FlexSearchPrimarySortClause } from './flex-search';
import { Index } from './indices';
import { Model } from './model';
import { ObjectTypeBase } from './object-type-base';
import { OrderDirection } from './order';
import { PermissionProfile } from './permission-profile';
import { Relation, RelationSide } from './relation';
import { RolesSpecifier } from './roles-specifier';
import { ScalarType } from './scalar-type';
import { TimeToLiveType } from './time-to-live';
import { EffectiveModuleSpecification } from './modules/effective-module-specification';

export class RootEntityType extends ObjectTypeBase {
    private readonly permissions: PermissionsConfig & {};
    readonly roles: RolesSpecifier | undefined;

    readonly kind: TypeKind.ROOT_ENTITY = TypeKind.ROOT_ENTITY;
    readonly isChildEntityType: false = false;
    readonly isRootEntityType: true = true;
    readonly isEntityExtensionType: false = false;
    readonly isValueObjectType: false = false;

    readonly isBusinessObject: boolean;

    readonly isFlexSearchIndexed: boolean;
    readonly flexSearchPrimarySort: ReadonlyArray<FlexSearchPrimarySortClause>;
    readonly flexSearchPerformanceParams: FlexSearchPerformanceParams;

    constructor(private readonly input: RootEntityTypeConfig, model: Model) {
        super(input, model, systemFieldInputs);
        this.permissions = input.permissions || {};
        this.roles =
            input.permissions && input.permissions.roles
                ? new RolesSpecifier(input.permissions.roles)
                : undefined;
        this.isBusinessObject = input.isBusinessObject || false;
        if (input.flexSearchIndexConfig && input.flexSearchIndexConfig.isIndexed) {
            this.isFlexSearchIndexed = true;
            this.flexSearchPrimarySort = this.completeFlexSearchPrimarySort(
                input.flexSearchIndexConfig.primarySort,
            );
            this.flexSearchPerformanceParams = input.flexSearchIndexConfig.performanceParams ?? {};
        } else {
            this.isFlexSearchIndexed = false;
            this.flexSearchPrimarySort = [];
            this.flexSearchPerformanceParams = {};
        }
    }

    @memorize()
    get indices(): ReadonlyArray<Index> {
        const indexConfigs = this.input.indices ? [...this.input.indices] : [];

        // @key implies a unique index
        // (do this to the inputs so that addIdentifyingSuffixIfNeeded is called on these, too)
        if (this.keyField) {
            const keyField = this.keyField;
            if (
                !indexConfigs.some(
                    (f) =>
                        f.unique === true && f.fields.length == 1 && f.fields[0] === keyField.name,
                )
            ) {
                indexConfigs.push({ unique: true, fields: [keyField.name] });
            }
        }

        for (const timeToLiveType of this.timeToLiveTypes) {
            indexConfigs.push({ unique: false, fields: [timeToLiveType.input.dateField] });
        }

        const indices = indexConfigs.map((config) => new Index(config, this));

        if (this.discriminatorField !== this.keyField) {
            if (
                !indices.some(
                    (index) =>
                        index.fields.length === 1 &&
                        index.fields[0].field === this.discriminatorField,
                )
            ) {
                // make sure there is an index on the discriminator field that can be used for sorting
                // arangodb already has an index on 'id', but it's a hash index which is unusable for sorting
                // if the discriminator field is the key field, we already added an index above.
                // don't use unique to avoid running into performance workarounds for unique indices (sparseness)
                indices.push(
                    new Index(
                        {
                            fields: [this.discriminatorField.name],
                        },
                        this,
                    ),
                );
            }
        }

        // deduplicate indices
        return indices.filter(
            (index, i1) => !indices.some((other, i2) => i1 < i2 && other.equals(index)),
        );
    }

    get hasFieldsIncludedInSearch() {
        return (
            this.fields.some((value) => value.isIncludedInSearch) ||
            this.fields.some((value) => value.isFulltextIncludedInSearch)
        );
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
            throw new Error(
                `Expected "${this.name}.${field.name}" to be of scalar type because it is a key field`,
            );
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
        return compact(this.fields.map((field) => field.relation));
    }

    /**
     * A list of all relations concerning this type, regardless of whether there is a field on this type for it
     */
    @memorize()
    get relations(): ReadonlyArray<Relation> {
        return this.model.relations.filter((rel) => rel.fromType === this || rel.toType === this);
    }

    /**
     * A list of all relations sides concerning this type, regardless of whether there is a field on this type for it
     */
    @memorize()
    get relationSides(): ReadonlyArray<RelationSide> {
        return [
            ...this.model.relations
                .filter((rel) => rel.fromType === this)
                .map((rel) => rel.fromSide),
            ...this.model.relations.filter((rel) => rel.toType === this).map((rel) => rel.toSide),
        ];
    }

    validate(context: ValidationContext) {
        super.validate(context);

        if (
            this.model.forbiddenRootEntityNames.find(
                (value) => this.name.toLowerCase() === value.toLowerCase(),
            )
        ) {
            context.addMessage(
                ValidationMessage.error(
                    `RootEntities cannot be named ${this.name}.`,
                    this.nameASTNode,
                ),
            );
        }

        this.validateKeyField(context);
        this.validatePermissions(context);
        this.validateIndices(context);
        this.validateFlexSearch(context);
    }

    private validateKeyField(context: ValidationContext) {
        if (this.input.keyFieldName == undefined) {
            return;
        }
        const astNode = this.input.keyFieldASTNode || this.astNode;

        const field = this.getField(this.input.keyFieldName);

        if (!field) {
            context.addMessage(
                ValidationMessage.error(
                    `Field "${this.input.keyFieldName}" does not exist on type "${this.name}".`,
                    astNode,
                ),
            );
            return;
        }

        // support for ID is needed because id: ID @key is possible
        const isSupported =
            field.type.kind === TypeKind.ENUM ||
            (field.type.kind === TypeKind.SCALAR &&
                [
                    SCALAR_INT,
                    SCALAR_STRING,
                    GraphQLInt53.name,
                    GraphQLID.name,
                    GraphQLLocalDate.name,
                ].includes(field.type.name));
        if (!isSupported) {
            context.addMessage(
                ValidationMessage.error(
                    `Only fields of type "String", "Int", "Int53", "ID", "LocalDate", and enum types can be used as key field.`,
                    astNode,
                ),
            );
        }

        if (field.isList) {
            context.addMessage(
                ValidationMessage.error(`List fields cannot be used as key field.`, astNode),
            );
        }
    }

    private validatePermissions(context: ValidationContext) {
        const permissions = this.permissions;
        if (permissions.permissionProfileName != undefined && permissions.roles != undefined) {
            const message = `Permission profile and explicit role specifiers cannot be combined.`;
            context.addMessage(
                ValidationMessage.error(
                    message,
                    permissions.permissionProfileNameAstNode || this.nameASTNode,
                ),
            );
            context.addMessage(
                ValidationMessage.error(message, permissions.roles.astNode || this.nameASTNode),
            );
        }

        if (
            permissions.permissionProfileName != undefined &&
            !this.namespace.getPermissionProfile(permissions.permissionProfileName)
        ) {
            context.addMessage(
                ValidationMessage.error(
                    `Permission profile "${permissions.permissionProfileName}" not found.`,
                    permissions.permissionProfileNameAstNode || this.nameASTNode,
                ),
            );
        }

        if (this.roles) {
            this.roles.validate(context);
        }

        this.validatePermissionProfileAccessGroup(context);
        this.validatePermissionProfileRestrictions(context);
    }

    private validatePermissionProfileAccessGroup(context: ValidationContext) {
        const usesAccessGroup =
            this.permissionProfile &&
            this.permissionProfile.permissions.some((per) => !!per.restrictToAccessGroups);
        if (usesAccessGroup) {
            const accessGroupField = this.getField(ACCESS_GROUP_FIELD);
            if (!accessGroupField) {
                context.addMessage(
                    ValidationMessage.error(
                        `The permission profile "${this.permissions.permissionProfileName}" uses "restrictToAccessGroups", but this root entity does not have a "${ACCESS_GROUP_FIELD}" field.`,
                        this.permissions.permissionProfileNameAstNode || this.nameASTNode,
                    ),
                );
            } else if (
                !accessGroupField.type.isEnumType &&
                accessGroupField.type.name !== GraphQLString.name
            ) {
                context.addMessage(
                    ValidationMessage.error(
                        `This field must be of String or enum type to be used as "accessGroup" with the permission profile "${this.permissions.permissionProfileName}".`,
                        accessGroupField.astNode || this.nameASTNode,
                    ),
                );
            }
        }
    }

    private validatePermissionProfileRestrictions(context: ValidationContext) {
        if (!this.permissionProfile) {
            return;
        }
        for (const permission of this.permissionProfile.permissions) {
            for (const restriction of permission.restrictions) {
                const nestedContext = new ValidationContext();

                const fieldPath = new FieldPath({
                    path: restriction.field,
                    baseType: this,
                    location: restriction.fieldValueLoc,
                    canUseCollectFields: false,
                    canTraverseRootEntities: false,
                });
                fieldPath.validate(nestedContext);

                const lastField = fieldPath.lastField;
                if (lastField) {
                    if (
                        lastField.type.kind !== TypeKind.SCALAR &&
                        lastField.type.kind !== TypeKind.ENUM
                    ) {
                        nestedContext.addMessage(
                            ValidationMessage.error(
                                `Field "${lastField.declaringType.name}.${lastField.name}" is of type "${lastField.type.name}", but only scalar and enum types fields can be used for field restrictions.`,
                                restriction.fieldValueLoc,
                            ),
                        );
                    }
                }
                if (fieldPath.fields) {
                    for (const field of fieldPath.fields) {
                        if (!field.isAccessField) {
                            nestedContext.addMessage(
                                ValidationMessage.error(
                                    `Field "${field.declaringType.name}.${field.name}" needs the @${ACCESS_FIELD_DIRECTIVE} directive to be used in a permission restriction.`,
                                    restriction.fieldValueLoc,
                                ),
                            );
                        }
                        if (this.isFlexSearchIndexed && !field.isFlexSearchIndexed) {
                            nestedContext.addMessage(
                                ValidationMessage.error(
                                    `Field "${field.declaringType.name}.${field.name}" needs the @${FLEX_SEARCH_INDEXED_DIRECTIVE} directive because type "${this.name}" is marked with "flexSearch: true".`,
                                    restriction.fieldValueLoc,
                                ),
                            );
                        }
                    }
                }

                // if there are validation errors in the field, show them at the usage and at the definition
                // (definition is useful because it shows the exact path within the field that is wrong)
                for (const message of nestedContext.validationMessages) {
                    context.addMessage(
                        new ValidationMessage(
                            message.severity,
                            `Permission profile "${this.permissionProfile.name}" defines restrictions that cannot be applied to type "${this.name}": ${message.message}`,
                            this.input.permissions?.permissionProfileNameAstNode,
                        ),
                    );
                    context.addMessage(
                        new ValidationMessage(
                            message.severity,
                            `Cannot be applied to type "${this.name}": ${message.message}`,
                            message.location,
                        ),
                    );
                }
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

    private validateFlexSearch(context: ValidationContext) {
        if (
            !this.isFlexSearchIndexed &&
            this.fields.some(
                (value) =>
                    (value.isFlexSearchIndexed || value.isFlexSearchFulltextIndexed) &&
                    !value.isSystemField,
            )
        ) {
            context.addMessage(
                ValidationMessage.warn(
                    `The type contains fields that are annotated with ${FLEX_SEARCH_INDEXED_DIRECTIVE} or ${FLEX_SEARCH_FULLTEXT_INDEXED_DIRECTIVE}, but the type itself is not marked with flexSearch = true.`,
                    this.input.astNode!.name,
                ),
            );
        }

        for (const clause of this.flexSearchPrimarySort) {
            clause.validate(context);
        }

        const perfParams = this.flexSearchPerformanceParams;
        if (perfParams.commitIntervalMsec !== undefined && perfParams.commitIntervalMsec < 100) {
            context.addMessage(
                ValidationMessage.error(
                    `Cannot be less than 100.`,
                    perfParams?.commitIntervalMsecASTNode,
                ),
            );
        }
        if (
            perfParams.consolidationIntervalMsec !== undefined &&
            perfParams.consolidationIntervalMsec < 100
        ) {
            context.addMessage(
                ValidationMessage.error(
                    `Cannot be less than 100.`,
                    perfParams?.consolidationIntervalMsecASTNode,
                ),
            );
        }
        if (perfParams.cleanupIntervalStep !== undefined && perfParams.cleanupIntervalStep < 0) {
            context.addMessage(
                ValidationMessage.error(
                    `Cannot be negative.`,
                    perfParams?.cleanupIntervalStepASTNode,
                ),
            );
        }
    }

    @memorize()
    get billingEntityConfig() {
        return this.model.billingEntityTypes.find((value) => value.rootEntityType === this);
    }

    private completeFlexSearchPrimarySort(
        clauses: ReadonlyArray<FlexSearchPrimarySortClauseConfig>,
    ): ReadonlyArray<FlexSearchPrimarySortClause> {
        // primary sort is only used for sorting, so make sure it's unique
        // - this makes querying more consistent
        // - this enables us to use primary sort for cursor-based pagination (which requires an absolute sort order)
        // the default primary sort should be createdAt_DESC, because this is useful most of the time. to avoid
        // surprises when you do specify a primary sort, always add this default at the end (as long as it's not already
        // included in the index, and only if the index is not already absolute)
        if (!clauses.some((clause) => clause.field === this.discriminatorField.name)) {
            if (!clauses.some((clause) => clause.field === ENTITY_CREATED_AT)) {
                clauses = [
                    ...clauses,
                    {
                        field: ENTITY_CREATED_AT,
                        direction: OrderDirection.DESCENDING,
                    },
                ];
            }
            clauses = [
                ...clauses,
                {
                    field: this.discriminatorField.name,
                    direction: OrderDirection.DESCENDING,
                },
            ];
        }
        return clauses.map((clause) => new FlexSearchPrimarySortClause(clause, this));
    }

    @memorize()
    get timeToLiveTypes(): ReadonlyArray<TimeToLiveType> {
        return this.model.timeToLiveTypes.filter(
            (ttlType) => ttlType.rootEntityType && ttlType.rootEntityType.name === this.name,
        );
    }

    @memorize()
    get effectiveModuleSpecification(): EffectiveModuleSpecification {
        // the default behavior for an ObjectType is to be included wherever a type is used.
        // for root entity types, this is not good - they generate API on their own, so they
        // should always be explicit. (this is also validated, but just to be sure)
        if (!this.moduleSpecification || !this.moduleSpecification.clauses) {
            return EffectiveModuleSpecification.EMPTY;
        }

        return super.effectiveModuleSpecification;
    }
}

const systemFieldInputs: ReadonlyArray<SystemFieldConfig> = [
    {
        name: 'id',
        typeName: 'ID',
        isNonNull: true,
        description:
            'An auto-generated string that identifies this root entity uniquely among others of the same type',
        isFlexSearchIndexed: true,
        isFlexSearchFulltextIndexed: false,
        isIncludedInSearch: false,
        allowedDirectiveNames: ['key', 'hidden'],
    },
    {
        name: 'createdAt',
        typeName: 'DateTime',
        isNonNull: true,
        description: 'The instant this object has been created',
        isFlexSearchIndexed: true,
        isFlexSearchFulltextIndexed: false,
        isIncludedInSearch: false,
        allowedDirectiveNames: ['hidden'],
    },
    {
        name: 'updatedAt',
        typeName: 'DateTime',
        isNonNull: true,
        description:
            'The instant this object has been updated the last time (not including relation updates)',
        isFlexSearchIndexed: true,
        isFlexSearchFulltextIndexed: false,
        isIncludedInSearch: false,
        allowedDirectiveNames: ['hidden'],
    },
];
