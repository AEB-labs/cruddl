import type { ArgumentNode } from 'graphql';
import { GraphQLID, GraphQLString } from 'graphql';
import { memorize } from 'memorize-decorator';
import {
    ACCESS_FIELD_DIRECTIVE,
    ACCESS_GROUP_FIELD,
    ENTITY_CREATED_AT,
    FLEX_SEARCH_FULLTEXT_INDEXED_DIRECTIVE,
    FLEX_SEARCH_INDEXED_DIRECTIVE,
    ID_FIELD,
    MODULES_ALL_ARG,
    MODULES_DIRECTIVE,
    SCALAR_INT,
    SCALAR_STRING,
} from '../../schema/constants.js';
import { GraphQLInt53 } from '../../schema/scalars/int53.js';
import { GraphQLLocalDate } from '../../schema/scalars/local-date.js';
import { isDefined } from '../../utils/utils.js';
import { ChangeSet, TextChange } from '../change-set/change-set.js';
import { createValueReplacementChange } from '../change-set/replace-value.js';
import { describeModuleSpecification } from '../compatibility-check/describe-module-specification.js';
import type {
    FlexSearchPerformanceParams,
    FlexSearchPrimarySortClauseConfig,
    IndexDefinitionConfig,
} from '../config/indices.js';
import type { PermissionsConfig } from '../config/permissions.js';
import type { RootEntityTypeConfig } from '../config/type.js';
import { TypeKind } from '../config/type.js';
import type { MessageLocation } from '../validation/location.js';
import { ValidationMessage } from '../validation/message.js';
import { QuickFix } from '../validation/quick-fix.js';
import { ValidationContext } from '../validation/validation-context.js';
import { FieldPath } from './field-path.js';
import type { Field, SystemFieldConfig } from './field.js';
import { FlexSearchPrimarySortClause } from './flex-search.js';
import { Index } from './indices.js';
import type { Model } from './model.js';
import { EffectiveModuleSpecification } from './modules/effective-module-specification.js';
import { ObjectTypeBase } from './object-type-base.js';
import { OrderDirection } from './order.js';
import type { PermissionProfile, PermissionRestriction } from './permission-profile.js';
import type { Relation, RelationSide } from './relation.js';
import { RolesSpecifier } from './roles-specifier.js';
import type { ScalarType } from './scalar-type.js';
import type { TimeToLiveType } from './time-to-live.js';

/**
 * Scalar types that are stored as objects, so restrictions on them never match
 */
const UNSUPPORTED_RESTRICTION_SCALAR_TYPES: ReadonlyArray<string> = [
    'I18nString',
    'StringMap',
    'JSON',
    'JSONObject',
    'OffsetDateTime',
];

/**
 * The JavaScript type a restriction value needs to have for fields of these scalar types
 */
const EXPECTED_RESTRICTION_VALUE_TYPES: { readonly [typeName: string]: string } = {
    String: 'string',
    ID: 'string',
    Boolean: 'boolean',
    Int: 'number',
    Int53: 'number',
    Float: 'number',
};

/**
 * Finds the enum value that only differs from the given value in casing (if there is exactly one)
 */
function getEnumValueWithDifferentCase(
    validValues: ReadonlyArray<string>,
    value: string,
): string | undefined {
    const matchingValues = validValues.filter((v) => v.toLowerCase() === value.toLowerCase());
    return matchingValues.length === 1 ? matchingValues[0] : undefined;
}

/**
 * Converts a restriction value to the expected type if this is possible without losing information
 */
function convertRestrictionValue(
    value: unknown,
    expectedType: string,
    typeName: string,
): unknown | undefined {
    switch (expectedType) {
        case 'string':
            return typeof value === 'number' || typeof value === 'boolean'
                ? String(value)
                : undefined;
        case 'boolean':
            return value === 'true' ? true : value === 'false' ? false : undefined;
        case 'number': {
            if (typeof value !== 'string' || !/^-?\d+(\.\d+)?$/.test(value)) {
                return undefined;
            }
            const number = Number(value);
            return typeName === 'Float' || Number.isInteger(number) ? number : undefined;
        }
        default:
            return undefined;
    }
}

function getChangeValueQuickFix(
    location: MessageLocation,
    key: string | undefined,
    value: unknown,
) {
    return new QuickFix({
        description: `Change value to ${JSON.stringify(value)}`,
        isPreferred: true,
        changeSet: new ChangeSet([createValueReplacementChange(location, key, value)]),
    });
}

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
    readonly isFlexSearchIndexedAstNode: ArgumentNode | undefined;
    readonly flexSearchPrimarySort: ReadonlyArray<FlexSearchPrimarySortClause>;
    readonly flexSearchPrimarySortAstNode: ArgumentNode | undefined;
    readonly flexSearchPerformanceParams: FlexSearchPerformanceParams;
    readonly indexConfigs: ReadonlyArray<IndexDefinitionConfig>;

    constructor(
        private readonly input: RootEntityTypeConfig,
        model: Model,
    ) {
        super(input, model, systemFieldInputs);
        this.permissions = input.permissions || {};
        this.roles =
            input.permissions && input.permissions.roles
                ? new RolesSpecifier(input.permissions.roles, this)
                : undefined;
        this.isBusinessObject = input.isBusinessObject || false;
        this.isFlexSearchIndexedAstNode = input.flexSearchIndexConfig?.isIndexedAstNode;
        if (input.flexSearchIndexConfig && input.flexSearchIndexConfig.isIndexed) {
            this.isFlexSearchIndexed = true;
            this.flexSearchPrimarySort = this.completeFlexSearchPrimarySort(
                input.flexSearchIndexConfig.primarySort,
            );
            this.flexSearchPrimarySortAstNode = input.flexSearchIndexConfig.primarySortAstNode;
            this.flexSearchPerformanceParams = input.flexSearchIndexConfig.performanceParams ?? {};
        } else {
            this.isFlexSearchIndexed = false;
            this.flexSearchPrimarySort = [];
            this.flexSearchPerformanceParams = {};
        }
        this.indexConfigs = input.indices ?? [];
    }

    @memorize()
    get indices(): ReadonlyArray<Index> {
        const indexConfigs = [...this.indexConfigs];

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
        // however, consider: this is used everywhere in primarySort, so changing it would cause
        // migrations to re-create all flexsearch views
        return this.getFieldOrThrow(ID_FIELD);
    }

    get permissionProfile(): PermissionProfile | undefined {
        if (!isDefined(this.permissions.permissionProfileName)) {
            if (isDefined(this.permissions.roles)) {
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
        return this.fields.map((field) => field.relation).filter(isDefined);
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
        if (!isDefined(this.input.keyFieldName)) {
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
        if (isDefined(permissions.permissionProfileName) && isDefined(permissions.roles)) {
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
            isDefined(permissions.permissionProfileName) &&
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
                        `The permission profile "${this.permissionProfile!.name}" uses "restrictToAccessGroups", but this root entity does not have a "${ACCESS_GROUP_FIELD}" field.`,
                        this.permissions.permissionProfileNameAstNode || this.nameASTNode,
                    ),
                );
            } else if (
                !accessGroupField.type.isEnumType &&
                accessGroupField.type.name !== GraphQLString.name
            ) {
                context.addMessage(
                    ValidationMessage.error(
                        `This field must be of String or enum type to be used as "accessGroup" with the permission profile "${this.permissionProfile!.name}".`,
                        accessGroupField.astNode || this.nameASTNode,
                    ),
                );
            }
            if (accessGroupField) {
                this.validateAccessGroupValues(accessGroupField, context);
                if (accessGroupField.isList) {
                    // this was not reported previously, but never worked as expected (normal queries never match,
                    // flexSearch queries match if any item matches)
                    context.addMessage(
                        ValidationMessage.suppressableWarning(
                            'DEPRECATED',
                            `Field "${ACCESS_GROUP_FIELD}" must not be a list to be used with "restrictToAccessGroups" (permission profile "${this.permissionProfile?.name}"). Use a String or enum field, or use "restrictions" on an @accessField list field. This will be an error in a future release.`,
                            accessGroupField.astNode,
                        ),
                    );
                }
                this.validateModulesOfAccessField(accessGroupField, context);
            }
        }
    }

    private validateAccessGroupValues(accessGroupField: Field, context: ValidationContext) {
        if (!this.permissionProfile || !accessGroupField.type.isEnumType) {
            return;
        }
        const enumType = accessGroupField.type;
        const validValues = enumType.values.map((v) => v.value);
        for (const permission of this.permissionProfile.permissions) {
            for (const [index, accessGroup] of (
                permission.restrictToAccessGroups ?? []
            ).entries()) {
                // placeholders are only known at runtime
                if (accessGroup.includes('$') || validValues.includes(accessGroup)) {
                    continue;
                }
                const accessGroupLocation = permission.restrictToAccessGroupsLocs?.[index];
                const suggestedValue = getEnumValueWithDifferentCase(validValues, accessGroup);
                context.addMessage(
                    ValidationMessage.suppressableWarning(
                        'DEPRECATED',
                        `Access group "${accessGroup}" in permission profile "${this.permissionProfile.name}" is not a value of enum "${enumType.name}" (field "${this.name}.${ACCESS_GROUP_FIELD}"), so it never matches. Valid values: ${validValues.join(', ')}. This will be an error in a future release.`,
                        this.astNode,
                        {
                            location:
                                accessGroupLocation ?? permission.loc ?? this.permissionProfile.loc,
                            quickFixes:
                                accessGroupLocation && suggestedValue !== undefined
                                    ? [
                                          getChangeValueQuickFix(
                                              accessGroupLocation,
                                              undefined,
                                              suggestedValue,
                                          ),
                                      ]
                                    : [],
                        },
                    ),
                );
            }
        }
    }

    /**
     * Gets a description of a problem with the value of a restriction, or undefined if there is none
     *
     * These problems were not reported previously, so they are reported as deprecations
     */
    private getRestrictionValueProblem(
        restriction: PermissionRestriction,
        lastField: Field,
    ): { readonly message: string; readonly suggestedValue?: unknown } | undefined {
        const fieldDesc = `field "${lastField.declaringType.name}.${lastField.name}"`;
        if (UNSUPPORTED_RESTRICTION_SCALAR_TYPES.includes(lastField.type.name)) {
            return {
                message: `Fields of type "${lastField.type.name}" cannot be used in permission restrictions (${fieldDesc}).`,
            };
        }

        if (restriction.value === null) {
            return { message: `Restriction value null on ${fieldDesc} has no defined behavior.` };
        }
        if (restriction.value !== undefined) {
            if (typeof restriction.value === 'object') {
                return {
                    message: `Restriction value on ${fieldDesc} is a list or an object, which is not supported. Use one permission per value, or "claim" with a list claim.`,
                };
            }
            if (lastField.type.isEnumType) {
                const validValues = lastField.type.values.map((v) => v.value);
                if (!validValues.includes(restriction.value as string)) {
                    return {
                        message: `Restriction value ${JSON.stringify(restriction.value)} on ${fieldDesc} is not a value of enum "${lastField.type.name}". Valid values: ${validValues.join(', ')}.`,
                        suggestedValue:
                            typeof restriction.value === 'string'
                                ? getEnumValueWithDifferentCase(validValues, restriction.value)
                                : undefined,
                    };
                }
                return undefined;
            }
            const expectedType = EXPECTED_RESTRICTION_VALUE_TYPES[lastField.type.name];
            if (expectedType && typeof restriction.value !== expectedType) {
                return {
                    message: `Restriction value ${JSON.stringify(restriction.value)} on ${fieldDesc} must be a ${expectedType} because the field is of type "${lastField.type.name}".`,
                    suggestedValue: convertRestrictionValue(
                        restriction.value,
                        expectedType,
                        lastField.type.name,
                    ),
                };
            }
            return undefined;
        }

        // valueTemplate and claim produce strings
        if (
            (restriction.valueTemplate !== undefined || restriction.claim !== undefined) &&
            !lastField.type.isEnumType &&
            lastField.type.name !== GraphQLString.name &&
            lastField.type.name !== GraphQLID.name
        ) {
            return {
                message: `"valueTemplate" and "claim" produce strings and can only be used on fields of type String, ID or an enum type, but ${fieldDesc} is of type "${lastField.type.name}".`,
            };
        }
        return undefined;
    }

    /**
     * Checks that a field used for access control is included in all modules of its declaring type
     *
     * Otherwise, the permission profile would not work in projects generated from some module selections
     */
    private validateModulesOfAccessField(field: Field, context: ValidationContext) {
        if (!field.moduleSpecification || field.moduleSpecification.all) {
            return;
        }
        const missingClauses =
            field.declaringType.effectiveModuleSpecification.orCombinedClauses.filter(
                (clause) =>
                    !field.effectiveModuleSpecification.includedIn(clause.andCombinedModules),
            );
        if (missingClauses.length) {
            const desc = describeModuleSpecification(
                new EffectiveModuleSpecification({ orCombinedClauses: missingClauses }),
                { preposition: 'in' },
            );
            const modulesDirectiveLocation = field.moduleSpecification.astNode?.loc;
            context.addMessage(
                ValidationMessage.error(
                    `Fields used for access control must always be included in all modules of their declaring type. Set @modules(all: true). (Field "${field.declaringType.name}.${field.name}" is used by permission profile "${this.permissionProfile?.name}". Type "${field.declaringType.name}" is included ${desc}, but the field is not.)`,
                    field.astNode,
                    {
                        quickFixes: modulesDirectiveLocation
                            ? [
                                  new QuickFix({
                                      description: 'Include in all modules',
                                      isPreferred: true,
                                      changeSet: new ChangeSet([
                                          new TextChange(
                                              modulesDirectiveLocation,
                                              `@${MODULES_DIRECTIVE}(${MODULES_ALL_ARG}: true)`,
                                          ),
                                      ]),
                                  }),
                              ]
                            : [],
                    },
                ),
            );
        }
    }

    /**
     * All fields that are used in the restriction paths of the permission profile of this type
     */
    @memorize()
    get fieldsUsedInPermissionRestrictions(): ReadonlySet<Field> {
        const fields = new Set<Field>();
        for (const permission of this.permissionProfile?.permissions ?? []) {
            for (const restriction of permission.restrictions) {
                const fieldPath = new FieldPath({
                    path: restriction.field,
                    baseType: this,
                    canUseCollectFields: false,
                    canTraverseRootEntities: false,
                    canNavigateIntoLists: true,
                });
                for (const field of fieldPath.fields ?? []) {
                    fields.add(field);
                }
            }
        }
        return fields;
    }

    private validatePermissionProfileRestrictions(context: ValidationContext) {
        if (!this.permissionProfile) {
            return;
        }
        const restrictedFields = new Set<Field>();
        for (const permission of this.permissionProfile.permissions) {
            for (const restriction of permission.restrictions) {
                const nestedContext = new ValidationContext();

                const fieldPath = new FieldPath({
                    path: restriction.field,
                    baseType: this,
                    location: restriction.fieldValueLoc,
                    canUseCollectFields: false,
                    canTraverseRootEntities: false,
                    // reported separately as a deprecation
                    canNavigateIntoLists: true,
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
                                `Field "${lastField.declaringType.name}.${lastField.name}" is of type "${lastField.type.name}", but only fields of scalar and enum types (or lists of them) can be used for field restrictions.`,
                                restriction.fieldValueLoc,
                            ),
                        );
                    } else {
                        const valueProblem = this.getRestrictionValueProblem(
                            restriction,
                            lastField,
                        );
                        if (valueProblem) {
                            context.addMessage(
                                ValidationMessage.suppressableWarning(
                                    'DEPRECATED',
                                    `Permission profile "${this.permissionProfile.name}" defines an unsupported restriction: ${valueProblem.message} This will be an error in a future release.`,
                                    this.astNode,
                                    {
                                        location: restriction.loc ?? restriction.fieldValueLoc,
                                        quickFixes:
                                            restriction.valueLoc &&
                                            valueProblem.suggestedValue !== undefined
                                                ? [
                                                      getChangeValueQuickFix(
                                                          restriction.valueLoc,
                                                          'value',
                                                          valueProblem.suggestedValue,
                                                      ),
                                                  ]
                                                : [],
                                    },
                                ),
                            );
                        }
                    }
                }
                if (fieldPath.fields) {
                    // FieldPath does not reliably detect this, so check explicitly
                    // (lists are only supported as the last field)
                    const listFieldInPath = fieldPath.fields
                        .slice(0, -1)
                        .find((field) => field.isList);
                    if (listFieldInPath) {
                        // we did not report this previously. In a transition period, we make it clear
                        // that this will be an error in the future.
                        context.addMessage(
                            ValidationMessage.suppressableWarning(
                                'DEPRECATED',
                                `Permission profile "${this.permissionProfile.name}" defines a restriction on field "${restriction.field}", but field "${listFieldInPath.declaringType.name}.${listFieldInPath.name}" is a list and cannot be navigated into. Lists are only supported as the last field of a restriction path. This will be an error in a future release.`,
                                this.astNode,
                                { location: restriction.fieldValueLoc },
                            ),
                        );
                    }

                    for (const field of fieldPath.fields) {
                        restrictedFields.add(field);
                        // system fields can't be annotated with @accessField
                        if (field.isSystemField) {
                            nestedContext.addMessage(
                                ValidationMessage.error(
                                    `System field "${field.declaringType.name}.${field.name}" cannot be used in permission restrictions.`,
                                    restriction.fieldValueLoc,
                                ),
                            );
                            continue;
                        }
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
                        new ValidationMessage({
                            severity: message.severity,
                            message: `Permission profile "${this.permissionProfile.name}" defines restrictions that cannot be applied to type "${this.name}": ${message.message}`,
                            // the default profile is not referenced explicitly
                            location:
                                this.input.permissions?.permissionProfileNameAstNode ??
                                this.nameASTNode,
                            quickFixes: message.quickFixes,
                        }),
                    );
                    context.addMessage(
                        new ValidationMessage({
                            severity: message.severity,
                            message: `Cannot be applied to type "${this.name}": ${message.message}`,
                            location: message.location,
                            quickFixes: message.quickFixes,
                        }),
                    );
                }
            }
        }

        for (const field of restrictedFields) {
            this.validateModulesOfAccessField(field, context);
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
                ValidationMessage.suppressableWarning(
                    'INEFFECTIVE_FLEX_SEARCH',
                    `The type contains fields that are annotated with ${FLEX_SEARCH_INDEXED_DIRECTIVE} or ${FLEX_SEARCH_FULLTEXT_INDEXED_DIRECTIVE}, but the type itself is not marked with flexSearch = true.`,
                    this.input.astNode,
                    { location: this.input.astNode?.name },
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
