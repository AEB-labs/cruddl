import {
    ASTNode,
    DirectiveNode,
    FieldDefinitionNode,
    GraphQLBoolean,
    GraphQLID,
    GraphQLInt,
    GraphQLString,
} from 'graphql';
import memorize from 'memorize-decorator';
import {
    ACCESS_GROUP_FIELD,
    CALC_MUTATIONS_OPERATORS,
    COLLECT_AGGREGATE_ARG,
    COLLECT_DIRECTIVE,
    FLEX_SEARCH_CASE_SENSITIVE_ARGUMENT,
    FLEX_SEARCH_INCLUDED_IN_SEARCH_ARGUMENT,
    MODULES_ALL_ARG,
    MODULES_DIRECTIVE,
    MODULES_INCLUDE_ALL_FIELDS_ARG,
    PARENT_DIRECTIVE,
    REFERENCE_DIRECTIVE,
    RELATION_DIRECTIVE,
    ROOT_DIRECTIVE,
} from '../../schema/constants';
import { GraphQLDateTime } from '../../schema/scalars/date-time';
import { GraphQLLocalDate } from '../../schema/scalars/local-date';
import { GraphQLLocalTime } from '../../schema/scalars/local-time';
import { GraphQLOffsetDateTime } from '../../schema/scalars/offset-date-time';
import { GraphQLI18nString } from '../../schema/scalars/string-map';
import {
    AggregationOperator,
    CalcMutationsOperator,
    FieldConfig,
    FlexSearchLanguage,
    RelationDeleteAction,
    TypeKind,
} from '../config';
import {
    collectEmbeddingEntityTypes,
    collectEmbeddingRootEntityTypes,
} from '../utils/emedding-entity-types';
import { findRecursiveCascadePath } from '../utils/recursive-cascade';
import { ValidationMessage } from '../validation';
import { ModelComponent, ValidationContext } from '../validation/validation-context';
import { numberTypeNames } from './built-in-types';
import { CollectPath } from './collect-path';
import { IDENTITY_ANALYZER, NORM_CI_ANALYZER } from './flex-search';
import { FieldLocalization } from './i18n';
import { Model } from './model';
import { EffectiveModuleSpecification } from './modules/effective-module-specification';
import { FieldModuleSpecification } from './modules/field-module-specification';
import { PermissionProfile } from './permission-profile';
import { Relation, RelationSide } from './relation';
import { RolesSpecifier } from './roles-specifier';
import { InvalidType, ObjectType, Type } from './type';
import { ValueObjectType } from './value-object-type';

export interface SystemFieldConfig extends FieldConfig {
    readonly isSystemField?: boolean;
    readonly isNonNull?: boolean;
    readonly allowedDirectiveNames?: ReadonlyArray<string>;
}

export class Field implements ModelComponent {
    readonly model: Model;
    readonly name: string;
    description: string | undefined;
    readonly deprecationReason: string | undefined;
    readonly astNode: FieldDefinitionNode | undefined;
    readonly isList: boolean;
    readonly isReference: boolean;
    readonly isRelation: boolean;
    readonly isCollectField: boolean;
    readonly collectPath: CollectPath | undefined;
    readonly aggregationOperator: AggregationOperator | undefined;
    readonly defaultValue?: any;
    readonly calcMutationOperators: ReadonlySet<CalcMutationsOperator>;
    readonly isParentField: boolean;
    readonly isRootField: boolean;
    readonly roles: RolesSpecifier | undefined;
    readonly isHidden: boolean;
    private _type: Type | undefined;

    /**
     * Specifies if this field can be used within restrictions of a permission profile
     *
     * The field does not need to be used within restrictions if this is true.
     */
    readonly isAccessField: boolean;

    /**
     * Indicates if this is an inherent field of the declaring type that will be maintained by the system and thus can
     * only be queried
     */
    readonly isSystemField: boolean;

    readonly moduleSpecification: FieldModuleSpecification | undefined;

    readonly referenceAstNode: ASTNode | undefined;
    readonly relationAstNode: ASTNode | undefined;
    readonly inverseOfAstNode: ASTNode | undefined;
    readonly relationDeleteActionAstNode: ASTNode | undefined;
    readonly collectAstNode: DirectiveNode | undefined;
    readonly collectPathAstNode: ASTNode | undefined;
    readonly aggregationOperatorAstNode: ASTNode | undefined;

    constructor(
        private readonly input: SystemFieldConfig,
        public readonly declaringType: ObjectType,
    ) {
        this.model = declaringType.model;
        this.name = input.name;
        this.description = input.description;
        this.deprecationReason = input.deprecationReason;
        this.astNode = input.astNode;
        this.defaultValue = input.defaultValue;
        this.isReference = input.isReference || false;
        this.isRelation = input.isRelation || false;
        this.isParentField = input.isParentField || false;
        this.isRootField = input.isRootField || false;
        this.isCollectField = !!input.collect;
        if (input.collect) {
            this.collectPath = new CollectPath(input.collect, this.declaringType);
            if (input.collect) {
                this.aggregationOperator = input.collect.aggregationOperator;
            }
        }
        this.isList = input.isList || false;
        this.calcMutationOperators = new Set(input.calcMutationOperators || []);
        this.roles =
            input.permissions && input.permissions.roles
                ? new RolesSpecifier(input.permissions.roles)
                : undefined;
        this.isSystemField = input.isSystemField || false;
        this.isAccessField = input.isAccessField ?? false;
        this.isHidden = !!input.isHidden;
        if (input.moduleSpecification) {
            this.moduleSpecification = new FieldModuleSpecification(
                input.moduleSpecification,
                this.model,
            );
        }
        this.referenceAstNode = input.referenceAstNode;
        this.relationAstNode = input.relationAstNode;
        this.inverseOfAstNode = input.inverseOfASTNode;
        this.relationDeleteActionAstNode = input.relationDeleteActionASTNode;
        this.collectAstNode = input.collect?.astNode;
        this.collectPathAstNode = input.collect?.pathASTNode;
        this.aggregationOperatorAstNode = input.collect?.aggregationOperatorASTNode;
    }

    /**
     * Indicates if this field can never be set manually (independent of permissions)
     */
    get isReadOnly(): boolean {
        return this.isSystemField;
    }

    get isDeprecated(): boolean {
        return !!this.deprecationReason;
    }

    /**
     * Specifies whether this field (or items within the list if this is a list) is never null
     */
    get isNonNull(): boolean {
        // list items and entity extensions are never null
        if (this.input.isNonNull || this.type.isEntityExtensionType || this.isList) {
            return true;
        }
        if (this.aggregationOperator && !canAggregationBeNull(this.aggregationOperator)) {
            return true;
        }
        // regular fields are nullable
        return false;
    }

    public get type(): Type {
        // cache this because getType is a lookup by string
        if (this._type) {
            return this._type;
        }
        const type = this.model.getType(this.input.typeName);
        if (type) {
            this._type = type;
            return type;
        }
        return new InvalidType(this.input.typeName, this.model);
    }

    public get hasValidType(): boolean {
        return !!this.model.getType(this.input.typeName);
    }

    public get hasDefaultValue(): boolean {
        return this.defaultValue !== undefined;
    }

    @memorize()
    get label(): Record<string, string> {
        const res: Record<string, string> = {};
        for (const [lang, localization] of Object.entries(this.model.i18n.getFieldI18n(this))) {
            if (localization.label) {
                res[lang] = localization.label;
            }
        }
        return res;
    }

    @memorize()
    get hint(): Record<string, string> {
        const res: Record<string, string> = {};
        for (const [lang, localization] of Object.entries(this.model.i18n.getFieldI18n(this))) {
            if (localization.hint) {
                res[lang] = localization.hint;
            }
        }
        return res;
    }

    @memorize()
    public get permissionProfile(): PermissionProfile | undefined {
        if (!this.input.permissions || this.input.permissions.permissionProfileName == undefined) {
            return undefined;
        }
        return this.declaringType.namespace.getPermissionProfile(
            this.input.permissions.permissionProfileName,
        );
    }

    public get inverseOf(): Field | undefined {
        if (this.input.inverseOfFieldName == undefined) {
            return undefined;
        }
        const type = this.type;
        if (!type.isObjectType) {
            return undefined;
        }
        return type.getField(this.input.inverseOfFieldName);
    }

    public get inverseField(): Field | undefined {
        return this.type.isObjectType
            ? this.type.fields.find((field) => field.inverseOf === this)
            : undefined;
    }

    public get relation(): Relation | undefined {
        const relationSide = this.relationSide;
        if (!relationSide) {
            return undefined;
        }
        return relationSide.relation;
    }

    @memorize()
    public get relationSide(): RelationSide | undefined {
        if (
            !this.isRelation ||
            !this.declaringType.isRootEntityType ||
            !this.type.isRootEntityType
        ) {
            return undefined;
        }
        if (this.inverseOf) {
            // this is the to side
            return new Relation({
                fromType: this.type,
                fromField: this.inverseOf,
                toType: this.declaringType,
                toField: this,
            }).toSide;
        } else {
            // this is the from side
            return new Relation({
                fromType: this.declaringType,
                fromField: this,
                toType: this.type,
                toField: this.inverseField,
            }).fromSide;
        }
    }

    public getRelationSideOrThrow(): RelationSide {
        if (this.type.kind != TypeKind.ROOT_ENTITY) {
            throw new Error(
                `Expected the type of field "${this.declaringType.name}.${this.name}" to be a root entity, but "${this.type.name}" is a ${this.type.kind}`,
            );
        }
        if (this.declaringType.kind != TypeKind.ROOT_ENTITY) {
            throw new Error(
                `Expected "${this.declaringType.name}" to be a root entity, but is ${this.declaringType.kind}`,
            );
        }
        const relationSide = this.relationSide;
        if (!relationSide) {
            throw new Error(`Expected "${this.declaringType.name}.${this}" to be a relation`);
        }
        return relationSide;
    }

    public getRelationOrThrow(): Relation {
        return this.getRelationSideOrThrow().relation;
    }

    get relationDeleteAction(): RelationDeleteAction {
        return this.input.relationDeleteAction ?? RelationDeleteAction.REMOVE_EDGES;
    }

    /**
     * The field that holds the key if this is a reference
     *
     * If this is a reference without an explicit key field, returns this (reference) field
     */
    @memorize()
    get referenceKeyField(): Field | undefined {
        if (!this.isReference) {
            return undefined;
        }
        if (!this.input.referenceKeyField) {
            return this;
        }
        return this.declaringType.getField(this.input.referenceKeyField);
    }

    getReferenceKeyFieldOrThrow(): Field {
        const keyField = this.referenceKeyField;
        if (!keyField) {
            throw new Error(
                `Expected "${this.declaringType.name}.${this.name}" to be a reference but it is not`,
            );
        }
        return keyField;
    }

    /**
     * A reference field within the same type that uses this field as its key field
     */
    @memorize()
    get referenceField(): Field | undefined {
        return this.declaringType.fields.filter((f) => f.referenceKeyField === this)[0];
    }

    public getLocalization(resolutionOrder: ReadonlyArray<string>): FieldLocalization {
        return this.model.i18n.getFieldLocalization(this, resolutionOrder);
    }

    @memorize()
    get effectiveModuleSpecification(): EffectiveModuleSpecification {
        if (
            this.moduleSpecification?.all ||
            this.declaringType.moduleSpecification?.includeAllFields
        ) {
            return this.declaringType.effectiveModuleSpecification;
        }
        // "clauses" being null either means all: true is set or it is implicitly set via includeAllFields
        // (in which case we would have already returned above),
        // or there is a validation error. In case of a validation error, it's safer to just not include the
        // field in any module.
        if (!this.moduleSpecification || !this.moduleSpecification.clauses) {
            return EffectiveModuleSpecification.EMPTY;
        }

        // TODO also consider fields that are traversed
        return this.declaringType.effectiveModuleSpecification.andCombineWith(
            new EffectiveModuleSpecification({
                orCombinedClauses: this.moduleSpecification.clauses,
            }),
        );
    }

    validate(context: ValidationContext) {
        this.validateName(context);
        this.validateType(context);
        this.validatePermissions(context);
        this.validateRootEntityType(context);
        this.validateEntityExtensionType(context);
        this.validateChildEntityType(context);
        this.validateRelation(context);
        this.validateReference(context);
        this.validateCollect(context);
        this.validateDefaultValue(context);
        this.validateCalcMutations(context);
        this.validateParentField(context);
        this.validateRootField(context);
        this.validateFlexSearch(context);
        this.validateAccessField(context);
        this.validateModuleSpecification(context);
    }

    private validateName(context: ValidationContext) {
        if (!this.name) {
            context.addMessage(ValidationMessage.error(`Field name is empty.`, this.astNode));
            return;
        }

        // Leading underscores are reserved for internal names, like ArangoDB's _key field
        if (this.name.startsWith('_')) {
            context.addMessage(
                ValidationMessage.error(
                    `Field names cannot start with an underscore.`,
                    this.astNode,
                ),
            );
            return;
        }

        // some naming convention rules

        if (this.name.includes('_')) {
            context.addMessage(
                ValidationMessage.warn(`Field names should not include underscores.`, this.astNode),
            );
            return;
        }

        if (!this.name.match(/^[a-z]/)) {
            context.addMessage(
                ValidationMessage.warn(
                    `Field names should start with a lowercase character.`,
                    this.astNode,
                ),
            );
        }
    }

    private validateType(context: ValidationContext) {
        if (!this.model.getType(this.input.typeName)) {
            context.addMessage(
                ValidationMessage.error(
                    `Type "${this.input.typeName}" not found.`,
                    this.input.typeNameAST || this.astNode,
                ),
            );
        }
    }

    private validateRootEntityType(context: ValidationContext) {
        // this does not fit anywhere else properly
        if (this.isReference && this.isRelation) {
            context.addMessage(
                ValidationMessage.error(
                    `@reference and @relation cannot be combined.`,
                    this.astNode,
                ),
            );
        }

        if (this.type.kind !== TypeKind.ROOT_ENTITY) {
            return;
        }

        // root entities are not embeddable
        if (
            !this.isRelation &&
            !this.isReference &&
            !this.isCollectField &&
            !this.isParentField &&
            !this.isRootField
        ) {
            const suggestions = [REFERENCE_DIRECTIVE];

            if (this.declaringType.kind === TypeKind.ROOT_ENTITY) {
                suggestions.push(RELATION_DIRECTIVE);
            }

            if (this.declaringType.kind === TypeKind.CHILD_ENTITY) {
                if (!this.declaringType.fields.some((f) => f.isParentField)) {
                    suggestions.push(PARENT_DIRECTIVE);
                }
                if (!this.declaringType.fields.some((f) => f.isRootField)) {
                    suggestions.push(PARENT_DIRECTIVE);
                }
            }

            const names = suggestions.map((n) => '@' + n);
            const list =
                names.length === 1
                    ? names
                    : names.slice(0, -1).join(', ') + ' or ' + names[names.length - 1];

            context.addMessage(
                ValidationMessage.error(
                    `Type "${this.type.name}" is a root entity type and cannot be embedded. Consider adding ${list}.`,
                    this.astNode,
                ),
            );
        }
    }

    private validateRelation(context: ValidationContext) {
        if (!this.isRelation) {
            return;
        }

        if (!this.declaringType.isRootEntityType) {
            context.addMessage(
                ValidationMessage.error(
                    `Relations can only be defined on root entity types. Consider using @reference instead.`,
                    this.astNode,
                ),
            );
        }

        // do target type validations only if it resolved correctly
        if (!this.hasValidType) {
            return;
        }

        if (!this.type.isRootEntityType) {
            context.addMessage(
                ValidationMessage.error(
                    `Type "${this.type.name}" cannot be used with @relation because it is not a root entity type.`,
                    this.astNode,
                ),
            );
            return;
        }

        if (this.input.inverseOfFieldName != undefined) {
            const inverseOf = this.type.getField(this.input.inverseOfFieldName);
            const inverseFieldDesc = `Field "${this.type.name}.${this.input.inverseOfFieldName}" used as inverse field of "${this.declaringType.name}.${this.name}"`;
            if (!inverseOf) {
                context.addMessage(
                    ValidationMessage.error(
                        `Field "${this.input.inverseOfFieldName}" does not exist on type "${this.type.name}".`,
                        this.input.inverseOfASTNode || this.astNode,
                    ),
                );
            } else if (inverseOf.type && inverseOf.type !== this.declaringType) {
                context.addMessage(
                    ValidationMessage.error(
                        `${inverseFieldDesc} has named type "${inverseOf.type.name}" but should be of type "${this.declaringType.name}".`,
                        this.input.inverseOfASTNode || this.astNode,
                    ),
                );
            } else if (!inverseOf.isRelation) {
                context.addMessage(
                    ValidationMessage.error(
                        `${inverseFieldDesc} does not have the @relation directive.`,
                        this.input.inverseOfASTNode || this.astNode,
                    ),
                );
            } else if (inverseOf.inverseOf != undefined) {
                context.addMessage(
                    ValidationMessage.error(
                        `${inverseFieldDesc} should not declare inverseOf itself.`,
                        this.input.inverseOfASTNode || this.astNode,
                    ),
                );
            }
            if (this.input.relationDeleteAction) {
                context.addMessage(
                    ValidationMessage.error(
                        `"onDelete" cannot be specified on inverse relations.`,
                        this.input.relationDeleteActionASTNode || this.astNode,
                    ),
                );
            }
        } else {
            // look for @relation(inverseOf: "thisField") in the target type
            const inverseFields = this.type.fields.filter((field) => field.inverseOf === this);
            if (inverseFields.length === 0) {
                // no @relation(inverseOf: "thisField") - should be ok, but is suspicious if there is a matching @relation back to this type
                // (look for inverseOfFieldName instead of inverseOf so that we don't emit this warning if the inverseOf config is invalid)
                const matchingRelation = this.type.fields.find(
                    (field) =>
                        field !== this &&
                        field.isRelation &&
                        field.type === this.declaringType &&
                        field.input.inverseOfFieldName == undefined,
                );
                if (matchingRelation) {
                    context.addMessage(
                        ValidationMessage.warn(
                            `This field and "${matchingRelation.declaringType.name}.${matchingRelation.name}" define separate relations. Consider using the "inverseOf" argument to add a backlink to an existing relation.`,
                            this.astNode,
                        ),
                    );
                }
            } else if (inverseFields.length > 1) {
                const names = inverseFields.map((f) => `"${this.type.name}.${f.name}"`).join(', ');
                // found multiple inverse fields - this is an error
                // check this here and not in the inverse fields so we don't report stuff twice
                for (const inverseField of inverseFields) {
                    context.addMessage(
                        ValidationMessage.error(
                            `Multiple fields (${names}) declare inverseOf to "${this.declaringType.name}.${this.name}".`,
                            inverseField.astNode,
                        ),
                    );
                }
                return; // no more errors that depend on the inverse fields
            }
            const inverseField: Field | undefined = inverseFields[0];

            if (this.relationDeleteAction === RelationDeleteAction.CASCADE) {
                // recursive CASCADE is not supported. It would be pretty complicated to implement in all but the
                // simplest cases (would result in pretty complicated traversal statements, or we would need to do
                // a dynamic number of statements by resolving the relations imperatively).
                // For simplicity, we also forbid it for simpler recursion (like a single self-recursive field)
                // first, simple self-recursion check to not confuse with a complicated error message
                if (this.type === this.declaringType) {
                    context.addMessage(
                        ValidationMessage.error(
                            `"CASCADE" cannot be used on recursive fields. Use "RESTRICT" instead.`,
                            this.input.relationDeleteActionASTNode,
                        ),
                    );
                    return;
                } else {
                    const recursivePath = findRecursiveCascadePath(this);
                    if (recursivePath) {
                        context.addMessage(
                            ValidationMessage.error(
                                `The path "${recursivePath
                                    .map((f) => f.name)
                                    .join(
                                        '.',
                                    )}" is a loop with "onDelete: CASCADE" on each relation, which is not supported. Break the loop by replacing "CASCADE" with "RESTRICT" on any of these relations.`,
                                this.input.relationDeleteActionASTNode,
                            ),
                        );
                        return;
                    }
                }

                // cascading delete is only allowed if this is a 1-to-* relation. If we would support it for n-to-*
                // relations, we would need to decide between two behaviors:
                // - delete the related object as soon as one of the referencing object is deleted -> this would cause
                //   unexpected data loss because deleting one object would clear the children of a *sibling* object. That
                //   would be very confusing.
                // - delete the related object once *all* of the referencing objects are deleted. This would avoid th
                //   data loss mentioned above, but it would be pretty complicated both to implement and to understand.
                //   better use RESTRICT and do it manually.
                // this also means that relations without inverse relations can't be used with CASCADE. That's a good thing
                // because the dependency that could cause an object to be deleted should be explicit.
                if (!inverseField) {
                    context.addMessage(
                        ValidationMessage.error(
                            `"CASCADE" is only supported on 1-to-n and 1-to-1 relations. Use "RESTRICT" instead or change this to a 1-to-${
                                this.isList ? 'n' : '1'
                            } relation by adding a field with the @relation(inverseOf: "${
                                this.name
                            }") directive to the target type "${this.type.name}".`,
                            this.input.relationDeleteActionASTNode,
                        ),
                    );
                    return;
                } else if (inverseField.isList) {
                    context.addMessage(
                        ValidationMessage.error(
                            `"CASCADE" is only supported on 1-to-n and 1-to-1 relations. Use "RESTRICT" instead or change this to a 1-to-${
                                this.isList ? 'n' : '1'
                            } relation by changing the type of "${this.type.name}.${
                                inverseField.name
                            }" to "${inverseField.type.name}".`,
                            this.input.relationDeleteActionASTNode,
                        ),
                    );
                }
            }
        }
    }

    private validateReference(context: ValidationContext) {
        if (!this.isReference) {
            return;
        }

        // do target type validations only if it resolved correctly
        if (!this.hasValidType) {
            return;
        }

        if (this.type.kind !== TypeKind.ROOT_ENTITY) {
            context.addMessage(
                ValidationMessage.error(
                    `"${this.type.name}" cannot be used as @reference type because is not a root entity type.`,
                    this.astNode,
                ),
            );
            return;
        }

        if (this.isList) {
            context.addMessage(
                ValidationMessage.error(
                    `@reference is not supported with list types. Consider wrapping the reference in a child entity or value object type.`,
                    this.astNode,
                ),
            );
        }

        if (!this.type.keyField) {
            context.addMessage(
                ValidationMessage.error(
                    `"${this.type.name}" cannot be used as @reference type because it does not have a field annotated with @key.`,
                    this.astNode,
                ),
            );
        } else if (!this.input.referenceKeyField) {
            // can only format this nicely if we have the key field
            context.addMessage(
                ValidationMessage.warn(
                    `Usage of @reference without the keyField argument is deprecated. Add a field of type "${this.type.keyField.type.name}" and specify it in @reference(keyField: "...")`,
                    this.astNode,
                ),
            );
        }

        this.validateReferenceKeyField(context);
    }

    private validateCollect(context: ValidationContext) {
        if (!this.input.collect) {
            return;
        }

        if (this.isRelation) {
            context.addMessage(
                ValidationMessage.error(
                    `@${COLLECT_DIRECTIVE} and @${RELATION_DIRECTIVE} cannot be combined.`,
                    this.astNode,
                ),
            );
            return;
        }
        if (this.isReference) {
            context.addMessage(
                ValidationMessage.error(
                    `@${COLLECT_DIRECTIVE} and @${REFERENCE_DIRECTIVE} cannot be combined.`,
                    this.astNode,
                ),
            );
            return;
        }
        if (!this.collectPath) {
            context.addMessage(
                ValidationMessage.error(
                    `The path cannot be empty.`,
                    this.input.collect.pathASTNode,
                ),
            );
            return;
        }
        if (!this.collectPath.validate(context)) {
            // path validation failed already
            return;
        }
        const resultingType = this.collectPath.resultingType;

        if (!this.collectPath.resultIsList) {
            context.addMessage(
                ValidationMessage.error(
                    `The path does not result in a list.`,
                    this.input.collect.pathASTNode,
                ),
            );
            return;
        }

        if (this.aggregationOperator) {
            const typeInfo = getAggregatorTypeInfo(this.aggregationOperator);
            if (typeInfo.lastSegmentShouldBeList) {
                const lastSegment = this.collectPath.segments[this.collectPath.segments.length - 1];
                if (lastSegment && !lastSegment.isListSegment) {
                    // we checked for resultIsList before, so there needs to be a list segment somewhere - so we can suggest to remove a segment
                    if (lastSegment.field.type.name === GraphQLBoolean.name) {
                        // for boolean fields, redirect to the boolean variants
                        context.addMessage(
                            ValidationMessage.error(
                                `Aggregation operator "${
                                    this.aggregationOperator
                                }" is only allowed if the last path segment is a list field. "${
                                    lastSegment.field.name
                                }" is of type "Boolean", so you may want to use "${
                                    this.aggregationOperator + '_TRUE'
                                }".`,
                                this.input.collect.aggregationOperatorASTNode,
                            ),
                        );
                    } else if (lastSegment.isNullableSegment) {
                        // show extended hint - user might have wanted to use e.g. "COUNT_NOT_NULL".
                        context.addMessage(
                            ValidationMessage.error(
                                `Aggregation operator "${
                                    this.aggregationOperator
                                }" is only allowed if the last path segment is a list field. If you want to exclude objects where "${
                                    lastSegment.field.name
                                }" is null, use "${
                                    this.aggregationOperator + '_NOT_NULL'
                                }; otherwise, remove "${lastSegment.field.name}" from the path.`,
                                this.input.collect.aggregationOperatorASTNode,
                            ),
                        );
                    } else {
                        context.addMessage(
                            ValidationMessage.error(
                                `Aggregation operator "${this.aggregationOperator}" is only allowed if the last path segment is a list field. Please remove "${lastSegment.field.name}" from the path.`,
                                this.input.collect.aggregationOperatorASTNode,
                            ),
                        );
                    }
                    return;
                }

                // even for boolean lists, we show a warning because boolean lists are sparingly used and e.g. using EVERY might be misleading there
                if (lastSegment && lastSegment.field.type.name === GraphQLBoolean.name) {
                    context.addMessage(
                        ValidationMessage.warn(
                            `Aggregation operator "${
                                this.aggregationOperator
                            }" only checks the number of items. "${
                                lastSegment.field.name
                            }" is of type "Boolean", so you may want to use the operator "${
                                this.aggregationOperator + '_TRUE'
                            }" instead which specifically checks for boolean "true".`,
                            this.input.collect.aggregationOperatorASTNode,
                        ),
                    );
                }
            }
            if (typeInfo.shouldBeNullable && !this.collectPath.resultIsNullable) {
                let addendum = '';
                const operatorName = this.aggregationOperator.toString();
                if (operatorName.endsWith('_NOT_NULL')) {
                    addendum = ` Consider using "${operatorName.substr(
                        0,
                        operatorName.length - '_NOT_NULL'.length,
                    )}`;
                }
                context.addMessage(
                    ValidationMessage.error(
                        `Aggregation operator "${this.aggregationOperator}" is only supported on nullable types, but the path does not result in a nullable type.` +
                            addendum,
                        this.input.collect.aggregationOperatorASTNode,
                    ),
                );
                return;
            }
            if (
                resultingType &&
                typeInfo.typeNames &&
                !typeInfo.typeNames.includes(resultingType.name)
            ) {
                context.addMessage(
                    ValidationMessage.error(
                        `Aggregation operator "${
                            this.aggregationOperator
                        }" is not supported on type "${
                            resultingType.name
                        }" (supported types: ${typeInfo.typeNames
                            .map((t) => `"${t}"`)
                            .join(', ')}).`,
                        this.input.collect.aggregationOperatorASTNode,
                    ),
                );
                return;
            }

            if (typeInfo.usesDistinct && resultingType) {
                if (!isDistinctAggregationSupported(resultingType)) {
                    let typeHint;
                    if (resultingType.isValueObjectType) {
                        const offendingFields =
                            getOffendingValueObjectFieldsForDistinctAggregation(resultingType);
                        const offendingFieldNames = offendingFields
                            .map((f) => `"${f.name}"`)
                            .join(', ');
                        typeHint = `value object type "${resultingType.name}" because its field${
                            offendingFields.length !== 1 ? 's' : ''
                        } ${offendingFieldNames} has a type that does not support this operator`;
                    } else if (resultingType.isEntityExtensionType) {
                        typeHint = `entity extension types. You can instead collect the parent objects by removing the last path segment`;
                    } else {
                        typeHint = `type "${
                            resultingType.name
                        }" (supported scalar types: ${scalarTypesThatSupportDistinctAggregation
                            .map((t) => `"${t}"`)
                            .join(', ')})`;
                    }
                    context.addMessage(
                        ValidationMessage.error(
                            `Aggregation operator "${this.aggregationOperator}" is not supported on ${typeHint}.`,
                            this.input.collect.aggregationOperatorASTNode,
                        ),
                    );
                    return;
                }
                // the operator is useless if it's an entity type and it can neither be null nor have duplicates
                if (
                    (resultingType.isRootEntityType || resultingType.isChildEntityType) &&
                    !this.collectPath.resultIsNullable &&
                    !this.collectPath.resultMayContainDuplicateEntities
                ) {
                    const suggestedOperator = getAggregatorWithoutDistinct(
                        this.aggregationOperator,
                    );
                    if (this.aggregationOperator === AggregationOperator.DISTINCT) {
                        // this one can just be removed
                        context.addMessage(
                            ValidationMessage.error(
                                `Aggregation operator "${this.aggregationOperator}" is not needed because the collect result can neither contain duplicate entities nor null values. Please remove the "${COLLECT_AGGREGATE_ARG}" argument".`,
                                this.input.collect.aggregationOperatorASTNode,
                            ),
                        );
                        return;
                    } else if (suggestedOperator) {
                        // the count operator should be replaced by the non-distinct count
                        context.addMessage(
                            ValidationMessage.error(
                                `Please use the operator "${suggestedOperator}" because the collect result can neither contain duplicate entities nor null values.".`,
                                this.input.collect.aggregationOperatorASTNode,
                            ),
                        );
                        return;
                    }
                }
            }

            let expectedResultingTypeName: string | undefined;
            if (typeof typeInfo.resultTypeName === 'string') {
                expectedResultingTypeName = typeInfo.resultTypeName;
            } else if (typeof typeInfo.resultTypeName === 'function' && resultingType) {
                expectedResultingTypeName = typeInfo.resultTypeName(resultingType.name);
            } else {
                expectedResultingTypeName = resultingType && resultingType.name;
            } // undefined means that the aggregation results in the item's type
            if (expectedResultingTypeName && this.type.name !== expectedResultingTypeName) {
                context.addMessage(
                    ValidationMessage.error(
                        `The aggregation results in type "${expectedResultingTypeName}", but this field is declared with type "${this.type.name}".`,
                        this.astNode && this.astNode.type,
                    ),
                );
                return;
            }

            if (!typeInfo.resultIsList && this.isList) {
                context.addMessage(
                    ValidationMessage.error(
                        `This aggregation field should not be declared as a list.`,
                        this.astNode && this.astNode.type,
                    ),
                );
                return;
            }

            if (typeInfo.resultIsList && !this.isList) {
                context.addMessage(
                    ValidationMessage.error(
                        `This aggregation field should be declared as a list because "${this.aggregationOperator}" results in a list.`,
                        this.astNode && this.astNode.type,
                    ),
                );
                return;
            }
        } else {
            // not an aggregation

            if (resultingType) {
                if (resultingType.isEntityExtensionType) {
                    // treat these separate from the list below because we can't even aggregate entity extensions (they're not nullable and not lists)
                    context.addMessage(
                        ValidationMessage.error(
                            `The collect path results in entity extension type "${resultingType.name}", but entity extensions cannot be collected. You can either collect the parent entity by removing the last path segment, or collect values within the entity extension by adding a path segment.`,
                            this.input.collect.pathASTNode,
                        ),
                    );
                    return;
                }
                if (
                    resultingType.isEnumType ||
                    resultingType.isScalarType ||
                    resultingType.isValueObjectType
                ) {
                    // this is a modeling design choice - it does not really make sense to "collect" non-entities without a link to the parent and without aggregating them
                    const typeKind = resultingType.isEnumType
                        ? 'enum'
                        : resultingType.isValueObjectType
                        ? 'value object'
                        : 'scalar';
                    const suggestion = isDistinctAggregationSupported(resultingType)
                        ? ` You may want to use the "${AggregationOperator.DISTINCT}" aggregation.`
                        : `You can either collect the parent entity by removing the last path segment, or add the "aggregate" argument to aggregate the values.`;
                    context.addMessage(
                        ValidationMessage.error(
                            `The collect path results in ${typeKind} type "${resultingType.name}", but ${typeKind}s cannot be collected without aggregating them. ` +
                                suggestion,
                            this.input.collect.pathASTNode,
                        ),
                    );
                    return;
                }
                if (this.collectPath.resultMayContainDuplicateEntities) {
                    const minimumAmbiguousPathEndIndex = this.collectPath.segments.findIndex(
                        (s) => s.resultMayContainDuplicateEntities,
                    );
                    const firstAmbiguousSegment =
                        this.collectPath.segments[minimumAmbiguousPathEndIndex];
                    const minimumAmbiguousPathPrefix =
                        minimumAmbiguousPathEndIndex >= 0
                            ? this.collectPath.path
                                  .split('.')
                                  .slice(0, minimumAmbiguousPathEndIndex + 1)
                                  .join('.')
                            : '';
                    const path =
                        minimumAmbiguousPathPrefix &&
                        minimumAmbiguousPathPrefix !== this.collectPath.path
                            ? `path prefix "${minimumAmbiguousPathPrefix}"`
                            : 'path';
                    const entityType = firstAmbiguousSegment
                        ? `${firstAmbiguousSegment.field.type.name} entities`
                        : `entities`;
                    let reason = '';
                    if (firstAmbiguousSegment && firstAmbiguousSegment.kind === 'relation') {
                        if (firstAmbiguousSegment.relationSide.targetField) {
                            reason = ` (because "${firstAmbiguousSegment.relationSide.targetType.name}.${firstAmbiguousSegment.relationSide.targetField.name}", which is the inverse relation field to "${firstAmbiguousSegment.field.declaringType.name}.${firstAmbiguousSegment.field.name}", is declared as a list)`;
                        } else {
                            reason = ` (because the relation target type "${firstAmbiguousSegment.relationSide.targetType.name}" does not declare an inverse relation field to "${firstAmbiguousSegment.field.declaringType.name}.${firstAmbiguousSegment.field.name}")`;
                        }
                    }
                    context.addMessage(
                        ValidationMessage.error(
                            `The ${path} can produce duplicate ${entityType}${reason}. Please set argument "${COLLECT_AGGREGATE_ARG}" to "${AggregationOperator.DISTINCT}" to filter out duplicates and null items if you don't want any other aggregation.`,
                            this.input.collect.pathASTNode,
                        ),
                    );
                    return;
                }
                if (this.collectPath.resultIsNullable) {
                    let fieldHint = '';
                    const lastNullableSegment = [...this.collectPath.segments]
                        .reverse()
                        .find((s) => s.isNullableSegment);
                    if (lastNullableSegment) {
                        fieldHint = ` because "${lastNullableSegment.field.declaringType.name}.${lastNullableSegment.field.name}" can be null`;
                    }
                    context.addMessage(
                        ValidationMessage.error(
                            `The collect path can produce items that are null${fieldHint}. Please set argument "${COLLECT_AGGREGATE_ARG}" to "${AggregationOperator.DISTINCT}" to filter out null items if you don't want any other aggregation.`,
                            this.input.collect.pathASTNode,
                        ),
                    );
                    return;
                }

                if (resultingType !== this.type) {
                    context.addMessage(
                        ValidationMessage.error(
                            `The collect path results in type "${resultingType.name}", but this field is declared with type "${this.type.name}".`,
                            this.astNode && this.astNode.type,
                        ),
                    );
                    return;
                }
            }
            if (!this.isList) {
                context.addMessage(
                    ValidationMessage.error(
                        `This collect field should be a declared as a list.`,
                        this.astNode && this.astNode.type,
                    ),
                );
                return;
            }
        }
    }

    private validateReferenceKeyField(context: ValidationContext) {
        if (!this.input.referenceKeyField) {
            return;
        }

        const keyField = this.declaringType.getField(this.input.referenceKeyField);
        if (!keyField) {
            context.addMessage(
                ValidationMessage.error(
                    `Field "${this.declaringType.name}.${this.input.referenceKeyField}" not found.`,
                    this.input.referenceKeyFieldASTNode,
                ),
            );
            return;
        }

        if (keyField.isSystemField) {
            context.addMessage(
                ValidationMessage.error(
                    `"${this.declaringType.name}.${this.input.referenceKeyField}" is a system field and cannot be used as keyField of a @reference.`,
                    this.input.referenceKeyFieldASTNode,
                ),
            );
            return;
        }

        // the following can only be validated if the target type is valid
        if (!this.type.isRootEntityType || !this.type.keyField) {
            return;
        }

        const targetKeyField = this.type.keyField;

        if (targetKeyField.type !== keyField.type) {
            context.addMessage(
                ValidationMessage.error(
                    `The type of the keyField "${this.declaringType.name}.${this.input.referenceKeyField}" ("${keyField.type.name}") must be the same as the type of the @key-annotated field "${this.type.name}.${targetKeyField.name}" ("${targetKeyField.type.name}")`,
                    this.input.referenceKeyFieldASTNode,
                ),
            );
            return;
        }

        // we leave type validation (scalar etc.) to the @key annotation

        // there can only be one reference for each key field
        // each reference just reports an error on itself so that all fields are highlighted
        if (this.declaringType.fields.some((f) => f !== this && f.referenceKeyField === keyField)) {
            context.addMessage(
                ValidationMessage.error(
                    `There are multiple references declared for keyField "${this.input.referenceKeyField}".`,
                    this.input.referenceKeyFieldASTNode,
                ),
            );
        }
    }

    private validateEntityExtensionType(context: ValidationContext) {
        if (this.type.kind !== TypeKind.ENTITY_EXTENSION) {
            return;
        }

        if (this.declaringType.kind === TypeKind.VALUE_OBJECT) {
            context.addMessage(
                ValidationMessage.error(
                    `Type "${this.type.name}" is an entity extension type and cannot be used within value object types. Change "${this.declaringType.name}" to an entity extension type or use a value object type for "${this.name}".`,
                    this.astNode,
                ),
            );
            return;
        }

        if (this.isList && !this.isCollectField) {
            // don't print this error if it's used with @collect - it will fail due to @collect, and the message here would not be helpful.
            context.addMessage(
                ValidationMessage.error(
                    `Type "${this.type.name}" is an entity extension type and cannot be used in a list. Change the field type to "${this.type.name}" (without brackets), or use a child entity or value object type instead.`,
                    this.astNode,
                ),
            );
        }
    }

    private validateChildEntityType(context: ValidationContext) {
        if (this.type.kind !== TypeKind.CHILD_ENTITY) {
            return;
        }

        if (this.declaringType.kind === TypeKind.VALUE_OBJECT) {
            context.addMessage(
                ValidationMessage.error(
                    `Type "${this.type.name}" is a child entity type and cannot be used within value object types. Change "${this.declaringType.name}" to an entity extension type or use a value object type for "${this.name}".`,
                    this.astNode,
                ),
            );
            return;
        }

        if (!this.isList && !this.isParentField) {
            context.addMessage(
                ValidationMessage.error(
                    `Type "${this.type.name}" is a child entity type and can only be used in a list. Change the field type to "[${this.type.name}]", or use an entity extension or value object type instead.`,
                    this.astNode,
                ),
            );
        }
    }

    private validatePermissions(context: ValidationContext) {
        const permissions = this.input.permissions || {};

        if (this.isCollectField && (permissions.permissionProfileName || permissions.roles)) {
            context.addMessage(
                ValidationMessage.error(
                    `Permissions to @traversal fields cannot be restricted explicitly (permissions of traversed fields and types are applied automatically).`,
                    this.astNode,
                ),
            );
            return;
        }

        if (permissions.permissionProfileName != undefined && permissions.roles != undefined) {
            const message = `Permission profile and explicit role specifiers cannot be combined.`;
            context.addMessage(
                ValidationMessage.error(
                    message,
                    permissions.permissionProfileNameAstNode || this.input.astNode,
                ),
            );
            context.addMessage(
                ValidationMessage.error(message, permissions.roles.astNode || this.input.astNode),
            );
        }

        if (
            permissions.permissionProfileName != undefined &&
            !this.declaringType.namespace.getPermissionProfile(permissions.permissionProfileName)
        ) {
            context.addMessage(
                ValidationMessage.error(
                    `Permission profile "${permissions.permissionProfileName}" not found.`,
                    permissions.permissionProfileNameAstNode || this.input.astNode,
                ),
            );
        }

        const permissionProfile = this.permissionProfile;
        if (permissionProfile) {
            if (permissionProfile.permissions.some((p) => p.restrictToAccessGroups)) {
                ValidationMessage.error(
                    `Permission profile "${permissions.permissionProfileName}" uses restrictToAccessGroup and therefore cannot be used on fields.`,
                    permissions.permissionProfileNameAstNode || this.input.astNode,
                );
            }
            if (permissionProfile.permissions.some((p) => p.restrictToAccessGroups)) {
                ValidationMessage.error(
                    `Permission profile "${permissions.permissionProfileName}" uses restrictions and therefore cannot be used on fields.`,
                    permissions.permissionProfileNameAstNode || this.input.astNode,
                );
            }
        }

        if (this.roles) {
            this.roles.validate(context);
        }
    }

    private validateDefaultValue(context: ValidationContext) {
        if (this.input.defaultValue === undefined) {
            return;
        }

        if (this.isRelation) {
            context.addMessage(
                ValidationMessage.error(
                    `Default values are not supported on relations.`,
                    this.input.defaultValueASTNode || this.astNode,
                ),
            );
            return;
        }

        if (this.isCollectField) {
            context.addMessage(
                ValidationMessage.error(
                    `Default values are not supported on collect fields.`,
                    this.input.defaultValueASTNode || this.astNode,
                ),
            );
            return;
        }

        if (this.isParentField) {
            context.addMessage(
                ValidationMessage.error(
                    `Default values are not supported on parent fields.`,
                    this.input.defaultValueASTNode || this.astNode,
                ),
            );
            return;
        }

        if (this.isRootField) {
            context.addMessage(
                ValidationMessage.error(
                    `Default values are not supported on root fields.`,
                    this.input.defaultValueASTNode || this.astNode,
                ),
            );
            return;
        }

        if (this.isReference) {
            context.addMessage(
                ValidationMessage.error(
                    `Default values are not supported on reference fields.`,
                    this.input.defaultValueASTNode || this.astNode,
                ),
            );
            return;
        }

        context.addMessage(
            ValidationMessage.info(
                `Take care, there are no type checks for default values yet.`,
                this.input.defaultValueASTNode || this.astNode,
            ),
        );
    }

    private validateCalcMutations(context: ValidationContext) {
        if (!this.calcMutationOperators.size) {
            return;
        }

        if (this.isList) {
            context.addMessage(
                ValidationMessage.error(
                    `Calc mutations are not supported on list fields.`,
                    this.astNode,
                ),
            );
            return;
        }

        const supportedOperators = CALC_MUTATIONS_OPERATORS.filter((op) =>
            op.supportedTypes.includes(this.type.name),
        );
        const supportedOperatorsDesc = supportedOperators
            .map((op) => '"' + op.name + '"')
            .join(', ');

        if (this.calcMutationOperators.size > 0 && !supportedOperators.length) {
            context.addMessage(
                ValidationMessage.error(
                    `Type "${this.type.name}" does not support any calc mutation operators.`,
                    this.astNode,
                ),
            );
            return;
        }

        for (const operator of this.calcMutationOperators) {
            const desc = CALC_MUTATIONS_OPERATORS.find((op) => op.name == operator);
            if (!desc) {
                // this is caught in the graphql-rules validator
                continue;
            }

            if (!desc.supportedTypes.includes(this.type.name)) {
                context.addMessage(
                    ValidationMessage.error(
                        `Calc mutation operator "${operator}" is not supported on type "${this.type.name}" (supported operators: ${supportedOperatorsDesc}).`,
                        this.astNode,
                    ),
                );
            }
        }

        if (this.declaringType.isValueObjectType) {
            context.addMessage(
                ValidationMessage.warn(
                    `Calc mutations do not work within value objects because value objects cannot be updated. This will be an error in a future release.`,
                    this.astNode,
                ),
            );
        }
    }

    private validateParentField(context: ValidationContext) {
        if (!this.isParentField) {
            return;
        }

        if (this.declaringType.kind !== 'CHILD_ENTITY') {
            context.addMessage(
                ValidationMessage.error(
                    `@${PARENT_DIRECTIVE} can only be used on fields of child entity types.`,
                    this.input.parentDirectiveNode,
                ),
            );
            return;
        }

        if (this.isReference) {
            context.addMessage(
                ValidationMessage.error(
                    `@${PARENT_DIRECTIVE} and @${REFERENCE_DIRECTIVE} cannot be combined.`,
                    this.astNode,
                ),
            );
            return;
        }

        if (this.isCollectField) {
            context.addMessage(
                ValidationMessage.error(
                    `@${PARENT_DIRECTIVE} and @${COLLECT_DIRECTIVE} cannot be combined.`,
                    this.astNode,
                ),
            );
            return;
        }

        if (this.isList) {
            context.addMessage(
                ValidationMessage.error(
                    `A parent field cannot be a list.`,
                    this.input.parentDirectiveNode,
                ),
            );
            return;
        }

        if (this.declaringType.fields.some((f) => f !== this && f.isParentField)) {
            context.addMessage(
                ValidationMessage.error(
                    `There can only be one parent field per type.`,
                    this.input.astNode,
                ),
            );
            return;
        }

        const { embeddingEntityTypes, otherEmbeddingTypes } = collectEmbeddingEntityTypes(
            this.declaringType,
        );

        if (!embeddingEntityTypes.size) {
            context.addMessage(
                ValidationMessage.error(
                    `Type "${this.declaringType.name}" is not used by any entity type and therefore cannot have a parent field.`,
                    this.input.parentDirectiveNode,
                ),
            );
            return;
        }

        if (embeddingEntityTypes.has(this.declaringType)) {
            let suggestion = '';
            // maybe @parent can just be swapped out for @root?
            if (
                this.type.isRootEntityType &&
                !this.declaringType.fields.some((f) => f.isRootField)
            ) {
                const { embeddingRootEntityTypes } = collectEmbeddingRootEntityTypes(
                    this.declaringType,
                );
                if (
                    embeddingRootEntityTypes.size === 1 &&
                    Array.from(embeddingRootEntityTypes)[0] === this.type
                ) {
                    suggestion = ' Use the @root directive instead.';
                }
            }

            // parent on recursive child entities just does not work because they always have two parents - make this clear
            context.addMessage(
                ValidationMessage.error(
                    `Type "${this.declaringType.name}" is a recursive child entity type and therefore cannot have a parent field.${suggestion}`,
                    this.input.parentDirectiveNode,
                ),
            );
            return;
        }

        if (embeddingEntityTypes.size > 1) {
            // a little nicer error message
            if (embeddingEntityTypes.has(this.type)) {
                const otherTypes = Array.from(embeddingEntityTypes).filter((t) => t !== this.type);
                if (otherTypes.length === 1) {
                    context.addMessage(
                        ValidationMessage.error(
                            `Type "${this.declaringType.name}" is used in entity type "${otherTypes[0].name}" as well and thus cannot have a parent field.`,
                            this.input.parentDirectiveNode,
                        ),
                    );
                } else {
                    const names = otherTypes.map((t) => `"${t.name}"`);
                    const nameList =
                        names.slice(0, -1).join(', ') + ' and ' + names[names.length - 1];
                    context.addMessage(
                        ValidationMessage.error(
                            `Type "${this.declaringType.name}" is used in entity types ${nameList} as well and thus cannot have a parent field.`,
                            this.input.parentDirectiveNode,
                        ),
                    );
                }
            } else {
                const names = Array.from(embeddingEntityTypes).map((t) => `"${t.name}"`);
                const nameList = names.slice(0, -1).join(', ') + ' and ' + names[names.length - 1];
                context.addMessage(
                    ValidationMessage.error(
                        `Type "${this.declaringType.name}" is used in multiple entity types (${nameList}) and thus cannot have a parent field.`,
                        this.input.parentDirectiveNode,
                    ),
                );
            }
            return;
        }

        const embeddingEntityType = Array.from(embeddingEntityTypes)[0];
        if (embeddingEntityType !== this.type) {
            if (otherEmbeddingTypes.has(this.type)) {
                context.addMessage(
                    ValidationMessage.error(
                        `Type "${this.declaringType.name}" is used in type "${this.type.name}", but the closest entity type in the hierarchy is "${embeddingEntityType.name}", so the type of this parent field should be "${embeddingEntityType.name}".`,
                        this.input.parentDirectiveNode,
                    ),
                );
            } else {
                context.addMessage(
                    ValidationMessage.error(
                        `Type "${this.declaringType.name}" is used in entity type "${embeddingEntityType.name}", so the type of this parent field should be "${embeddingEntityType.name}".`,
                        this.input.parentDirectiveNode,
                    ),
                );
            }
            return;
        }

        if (!this.type.isRootEntityType) {
            let rootNote = '';
            if (!this.declaringType.fields.some((f) => f.isRootField)) {
                const { embeddingRootEntityTypes } = collectEmbeddingRootEntityTypes(
                    this.declaringType,
                );
                if (embeddingRootEntityTypes.size === 1) {
                    const rootType = Array.from(embeddingRootEntityTypes)[0];
                    rootNote = ` You could add a @root field (of type "${rootType.name}") instead.`;
                }
            }
            context.addMessage(
                ValidationMessage.warn(
                    `Parent fields currently can't be selected within collect fields, so this field will probably be useless.${rootNote}`,
                    this.input.parentDirectiveNode,
                ),
            );
        }
    }

    private validateRootField(context: ValidationContext) {
        if (!this.isRootField) {
            return;
        }

        if (this.isParentField) {
            context.addMessage(
                ValidationMessage.error(
                    `@${PARENT_DIRECTIVE} and @${ROOT_DIRECTIVE} cannot be combined.`,
                    this.astNode,
                ),
            );
            return;
        }

        if (this.declaringType.kind !== 'CHILD_ENTITY') {
            context.addMessage(
                ValidationMessage.error(
                    `@${ROOT_DIRECTIVE} can only be used on fields of child entity types.`,
                    this.input.rootDirectiveNode,
                ),
            );
            return;
        }

        if (this.isReference) {
            context.addMessage(
                ValidationMessage.error(
                    `@${ROOT_DIRECTIVE} and @${REFERENCE_DIRECTIVE} cannot be combined.`,
                    this.astNode,
                ),
            );
            return;
        }

        if (this.isCollectField) {
            context.addMessage(
                ValidationMessage.error(
                    `@${ROOT_DIRECTIVE} and @${COLLECT_DIRECTIVE} cannot be combined.`,
                    this.astNode,
                ),
            );
            return;
        }

        if (this.isList) {
            context.addMessage(
                ValidationMessage.error(
                    `A root field cannot be a list.`,
                    this.input.rootDirectiveNode,
                ),
            );
            return;
        }

        if (this.declaringType.fields.some((f) => f !== this && f.isRootField)) {
            context.addMessage(
                ValidationMessage.error(
                    `There can only be one root field per type.`,
                    this.input.astNode,
                ),
            );
            return;
        }

        const { embeddingRootEntityTypes } = collectEmbeddingRootEntityTypes(this.declaringType);

        if (!embeddingRootEntityTypes.size) {
            context.addMessage(
                ValidationMessage.error(
                    `Type "${this.declaringType.name}" is not used by any root entity type and therefore cannot have a root field.`,
                    this.input.rootDirectiveNode,
                ),
            );
            return;
        }

        if (embeddingRootEntityTypes.size > 1) {
            // a little nicer error message
            if (embeddingRootEntityTypes.has(this.type)) {
                const otherTypes = Array.from(embeddingRootEntityTypes).filter(
                    (t) => t !== this.type,
                );
                if (otherTypes.length === 1) {
                    context.addMessage(
                        ValidationMessage.error(
                            `Type "${this.declaringType.name}" is used in root entity type "${otherTypes[0].name}" as well and thus cannot have a root field.`,
                            this.input.rootDirectiveNode,
                        ),
                    );
                } else {
                    const names = otherTypes.map((t) => `"${t.name}"`);
                    const nameList =
                        names.slice(0, -1).join(', ') + ' and ' + names[names.length - 1];
                    context.addMessage(
                        ValidationMessage.error(
                            `Type "${this.declaringType.name}" is used in root entity types ${nameList} as well and thus cannot have a root field.`,
                            this.input.rootDirectiveNode,
                        ),
                    );
                }
            } else {
                const names = Array.from(embeddingRootEntityTypes).map((t) => `"${t.name}"`);
                const nameList = names.slice(0, -1).join(', ') + ' and ' + names[names.length - 1];
                context.addMessage(
                    ValidationMessage.error(
                        `Type "${this.declaringType.name}" is used in multiple root entity types (${nameList}) and thus cannot have a root field.`,
                        this.input.rootDirectiveNode,
                    ),
                );
            }
            return;
        }

        const embeddingRootEntityType = Array.from(embeddingRootEntityTypes)[0];
        if (embeddingRootEntityType !== this.type) {
            context.addMessage(
                ValidationMessage.error(
                    `Type "${this.declaringType.name}" is used in root entity type "${embeddingRootEntityType.name}", so the type of this root field should be "${embeddingRootEntityType.name}".`,
                    this.input.rootDirectiveNode,
                ),
            );
            return;
        }
    }

    private validateFlexSearch(context: ValidationContext) {
        const notSupportedOn = `@flexSearch is not supported on`;
        if (this.isFlexSearchIndexed) {
            if (this.isReference) {
                context.addMessage(
                    ValidationMessage.error(
                        `${notSupportedOn} references.`,
                        this.input.isFlexSearchIndexedASTNode,
                    ),
                );
                return;
            }
            if (this.isRelation) {
                context.addMessage(
                    ValidationMessage.error(
                        `${notSupportedOn} relations.`,
                        this.input.isFlexSearchIndexedASTNode,
                    ),
                );
                return;
            }
            if (this.isCollectField) {
                context.addMessage(
                    ValidationMessage.error(
                        `${notSupportedOn} collect fields.`,
                        this.input.isFlexSearchIndexedASTNode,
                    ),
                );
                return;
            }
            if (this.isParentField) {
                context.addMessage(
                    ValidationMessage.error(
                        `${notSupportedOn} parent fields.`,
                        this.input.isFlexSearchIndexedASTNode,
                    ),
                );
                return;
            }
            if (this.isRootField) {
                context.addMessage(
                    ValidationMessage.error(
                        `${notSupportedOn} root fields.`,
                        this.input.isFlexSearchIndexedASTNode,
                    ),
                );
                return;
            }
        }

        const supportedNonNumberScalarTypeNames = [
            GraphQLString.name,
            GraphQLI18nString.name,
            GraphQLID.name,
            GraphQLDateTime.name,
            GraphQLLocalDate.name,
            GraphQLLocalTime.name,
            GraphQLOffsetDateTime.name,
            GraphQLBoolean.name,
        ];
        if (
            this.isFlexSearchIndexed &&
            this.type.isScalarType &&
            !this.type.isNumberType &&
            !supportedNonNumberScalarTypeNames.includes(this.type.name)
        ) {
            // this used to be accepted silently in the past
            // report a warning for the transition period, and change this to an error later
            context.addMessage(
                ValidationMessage.warn(
                    `@flexSearch is not supported on type "${this.type.name}". Remove this directive. This will be an error in a future release.`,
                    this.input.isFlexSearchIndexedASTNode,
                ),
            );
        }

        const supportedFullTextTypeNames = [GraphQLString.name, GraphQLI18nString.name];
        if (
            this.isFlexSearchFulltextIndexed &&
            !(this.type.isScalarType && supportedFullTextTypeNames.includes(this.type.name))
        ) {
            context.addMessage(
                ValidationMessage.error(
                    `@flexSearchFulltext is not supported on type "${this.type.name}".`,
                    this.input.isFlexSearchFulltextIndexedASTNode,
                ),
            );
            return;
        }
        if (this.isFlexSearchFulltextIndexed && this.isCollectField) {
            context.addMessage(
                ValidationMessage.error(
                    `${notSupportedOn} collect fields.`,
                    this.input.isFlexSearchFulltextIndexedASTNode,
                ),
            );
            return;
        }
        if (
            this.isFlexSearchIndexed &&
            (this.type.isEntityExtensionType || this.type.isValueObjectType) &&
            !this.type.fields.some(
                (value) => value.isFlexSearchIndexed || value.isFlexSearchFulltextIndexed,
            )
        ) {
            context.addMessage(
                ValidationMessage.error(
                    `At least one field on type "${this.type.name}" must be annotated with @flexSearch or @flexSearchFulltext if @flexSearch is specified on the type declaration.`,
                    this.input.isFlexSearchIndexedASTNode,
                ),
            );
        }
        if (
            this.isIncludedInSearch &&
            this.type.isObjectType &&
            !this.type.fields.some(
                (value) => value.isIncludedInSearch || value.isFulltextIncludedInSearch,
            )
        ) {
            context.addMessage(
                ValidationMessage.warn(
                    `"includeInSearch: true" does not have an effect because none of the fields in type "${this.type.name}" have "includeInSearch: true".`,
                    this.input.isFlexSearchIndexedASTNode ??
                        this.input.isFlexSearchFulltextIndexedASTNode,
                ),
            );
        }
        if (
            this.name === ACCESS_GROUP_FIELD &&
            this.declaringType.isRootEntityType &&
            this.declaringType.permissionProfile &&
            this.declaringType.permissionProfile.permissions.some(
                (value) => value.restrictToAccessGroups,
            ) &&
            this.declaringType.isFlexSearchIndexed &&
            !this.isFlexSearchIndexed
        ) {
            context.addMessage(
                ValidationMessage.error(
                    `The permission profile "${this.declaringType.permissionProfile.name}" uses "restrictToAccessGroups", ` +
                        `and this fields defining type is marked with "flexSearch: true", but this field is not marked with "@flexSearch".`,
                    this.astNode,
                ),
            );
        }
        if (
            this.isIncludedInSearch &&
            !this.type.isObjectType &&
            !(this.type.isScalarType && this.type.name === 'String')
        ) {
            context.addMessage(
                ValidationMessage.error(
                    `"${FLEX_SEARCH_INCLUDED_IN_SEARCH_ARGUMENT}: true" is only supported on the types "String", "[String]" and object types.`,
                    this.input.isFlexSearchIndexedASTNode,
                ),
            );
            return;
        }
        if (
            this.input.isFlexSearchIndexCaseSensitive !== undefined &&
            !(this.type.isScalarType && this.type.name === 'String')
        ) {
            context.addMessage(
                ValidationMessage.error(
                    `"${FLEX_SEARCH_CASE_SENSITIVE_ARGUMENT}" is only supported on the types "String" and "[String]".`,
                    this.input.flexSearchIndexCaseSensitiveASTNode,
                ),
            );
            return;
        }
        if (
            this.input.isFlexSearchIndexCaseSensitive === false &&
            (this.isAccessField || this.name === ACCESS_GROUP_FIELD)
        ) {
            context.addMessage(
                ValidationMessage.error(
                    `"${FLEX_SEARCH_CASE_SENSITIVE_ARGUMENT}" cannot be set to false on accessGroup and @accessField-annotated fields (and it is always implicitly true)`,
                    this.input.flexSearchIndexCaseSensitiveASTNode,
                ),
            );
            return;
        }

        if (this.hasRecursiveIncludeInSearch()) {
            context.addMessage(
                ValidationMessage.error(
                    `"includeInSearch" cannot be used here because it would cause a recursion.`,
                    this.input.isFlexSearchIndexedASTNode,
                ),
            );
            return;
        }
    }

    private hasRecursiveIncludeInSearch(): boolean {
        function fieldHasRecursiveIncludeInSearch(
            field: Field,
            typesInPath: ReadonlyArray<string>,
        ): boolean {
            if (!field.isIncludedInSearch || !field.type.isObjectType) {
                return false;
            }
            for (const childField of field.type.fields) {
                if (!childField.isIncludedInSearch) {
                    // isFulltextIncludedInSearch can also be ignored here because they can only be used
                    // on strings and thus never cause a recursion
                    continue;
                }
                if (typesInPath.includes(childField.input.typeName)) {
                    return true;
                }
                if (
                    fieldHasRecursiveIncludeInSearch(childField, [
                        ...typesInPath,
                        field.input.typeName,
                    ])
                ) {
                    return true;
                }
            }
            return false;
        }

        return fieldHasRecursiveIncludeInSearch(this, []);
    }

    private validateAccessField(context: ValidationContext) {
        if (!this.isAccessField) {
            return;
        }
        if (this.isCollectField) {
            context.addMessage(
                ValidationMessage.error(
                    `Collect fields cannot be access fields`,
                    this.input.accessFieldDirectiveASTNode,
                ),
            );
        }
        if (this.isRootField) {
            context.addMessage(
                ValidationMessage.error(
                    `Root fields cannot be access fields`,
                    this.input.accessFieldDirectiveASTNode,
                ),
            );
        }
        if (this.isParentField) {
            context.addMessage(
                ValidationMessage.error(
                    `Parent fields cannot be access fields`,
                    this.input.accessFieldDirectiveASTNode,
                ),
            );
        }
        if (this.type.isRootEntityType) {
            context.addMessage(
                ValidationMessage.error(
                    `Fields to other root entities cannot be access fields`,
                    this.input.accessFieldDirectiveASTNode,
                ),
            );
        }
    }

    private validateModuleSpecification(context: ValidationContext) {
        if (this.isSystemField) {
            return;
        }

        if (!this.moduleSpecification) {
            if (
                !this.isSystemField &&
                this.declaringType.moduleSpecification &&
                !this.declaringType.moduleSpecification.includeAllFields
            ) {
                context.addMessage(
                    ValidationMessage.error(
                        `Missing module specification. Either add @${MODULES_DIRECTIVE} on field "${this.name}", or specify @${MODULES_DIRECTIVE}(${MODULES_INCLUDE_ALL_FIELDS_ARG}: true) on type "${this.declaringType.name}".`,
                        this.astNode,
                    ),
                );
            }
            return;
        }

        if (
            this.input.moduleSpecification &&
            this.declaringType.moduleSpecification?.includeAllFields
        ) {
            context.addMessage(
                ValidationMessage.error(
                    `@${MODULES_DIRECTIVE} cannot be specified here because @${MODULES_DIRECTIVE}(${MODULES_INCLUDE_ALL_FIELDS_ARG}: true) is specified on type "${this.declaringType.name}", and therefore @${MODULES_DIRECTIVE}(${MODULES_ALL_ARG}: true) is implicitly configured for all its fields.`,
                    this.moduleSpecification.astNode ?? this.astNode,
                ),
            );
        }

        this.moduleSpecification.validate(context);
    }

    get isFlexSearchIndexed(): boolean {
        // @key-annotated fields are automatically flex-search indexed
        return (
            !!this.input.isFlexSearchIndexed ||
            (this.declaringType.isRootEntityType &&
                this.declaringType.isFlexSearchIndexed &&
                this.declaringType.keyField === this)
        );
    }

    get isFlexSearchIndexCaseSensitive(): boolean {
        // for security reasons, always treat access-relevant as case-sensitive
        // (flexsearch is also used to apply permission restrictions)
        if (this.isAccessField || this.name === ACCESS_GROUP_FIELD) {
            return true;
        }

        return this.input.isFlexSearchIndexCaseSensitive ?? false;
    }

    get flexSearchAnalyzer(): string | undefined {
        if (!this.isFlexSearchIndexed) {
            return undefined;
        }
        if (this.isFlexSearchStringBased) {
            // only consider case-sensitivity for string fields
            // (we don't validate isFlexSearchIndexCaseSensitive type-dependent)
            return this.isFlexSearchIndexCaseSensitive ? IDENTITY_ANALYZER : NORM_CI_ANALYZER;
        }
        return IDENTITY_ANALYZER;
    }

    /**
     * Indicates whether the flexSearch index is based on a string (and e.g. FLEX_STRING_GREATER_THAN should be used)
     * or if it's a string/boolean/number
     */
    get isFlexSearchStringBased() {
        return (
            this.type.isScalarType &&
            [GraphQLString.name, GraphQLI18nString.name].includes(this.type.name)
        );
    }

    get flexSearchFulltextAnalyzer(): string | undefined {
        if (!this.flexSearchLanguage) {
            return undefined;
        }
        return 'text_' + this.flexSearchLanguage.toLocaleLowerCase();
    }

    getFlexSearchFulltextAnalyzerOrThrow(): string {
        const analyzer = this.flexSearchFulltextAnalyzer;
        if (!analyzer) {
            throw new Error(
                `Expected field ${this.declaringType.name}.${this.name} to have a flexSearch fulltext language, but it does not`,
            );
        }
        return analyzer;
    }

    get isFlexSearchFulltextIndexed(): boolean {
        return !!this.input.isFlexSearchFulltextIndexed;
    }

    get isIncludedInSearch(): boolean {
        // if flexsearch is manually configured, use that option
        if (this.input.isFlexSearchIndexed) {
            return !!this.input.isIncludedInSearch;
        }

        if (!this.type.isScalarType || this.type.name !== GraphQLString.name) {
            // includeInSearch only supported on string
            return false;
        }

        // key fields are included in search (unless manually configured or not supported)
        if (
            this.declaringType.isRootEntityType &&
            this.declaringType.isFlexSearchIndexed &&
            this.declaringType.keyField === this
        ) {
            return true;
        }

        return false;
    }

    get isFulltextIncludedInSearch(): boolean {
        return !!this.input.isFulltextIncludedInSearch && this.isFlexSearchFulltextIndexed;
    }

    get flexSearchLanguage(): FlexSearchLanguage | undefined {
        return this.input.flexSearchLanguage || this.declaringType.flexSearchLanguage;
    }
}

function getAggregatorWithoutDistinct(
    aggregator: AggregationOperator,
): AggregationOperator | undefined {
    switch (aggregator) {
        case AggregationOperator.DISTINCT:
            return undefined;
        case AggregationOperator.COUNT_DISTINCT:
            return AggregationOperator.COUNT;
        default:
            return undefined;
    }
}

function getAggregatorTypeInfo(aggregator: AggregationOperator): {
    readonly typeNames?: ReadonlyArray<string> | undefined;
    readonly lastSegmentShouldBeList?: boolean;
    readonly shouldBeNullable?: boolean;
    readonly resultTypeName?: string | ((typeName: string) => string);
    readonly resultIsList?: boolean;
    readonly usesDistinct?: boolean;
} {
    switch (aggregator) {
        case AggregationOperator.COUNT:
            return {
                lastSegmentShouldBeList: true,
                resultTypeName: GraphQLInt.name,
            };
        case AggregationOperator.SOME:
        case AggregationOperator.NONE:
            return {
                lastSegmentShouldBeList: true,
                resultTypeName: GraphQLBoolean.name,
            };

        case AggregationOperator.COUNT_NULL:
        case AggregationOperator.COUNT_NOT_NULL:
            return {
                shouldBeNullable: true,
                resultTypeName: GraphQLInt.name,
            };
        case AggregationOperator.SOME_NULL:
        case AggregationOperator.SOME_NOT_NULL:
        case AggregationOperator.EVERY_NULL:
        case AggregationOperator.NONE_NULL:
            return {
                shouldBeNullable: true,
                resultTypeName: GraphQLBoolean.name,
            };

        case AggregationOperator.MAX:
        case AggregationOperator.MIN:
            return {
                typeNames: [
                    ...numberTypeNames,
                    GraphQLDateTime.name,
                    GraphQLLocalDate.name,
                    GraphQLLocalTime.name,
                    GraphQLOffsetDateTime.name,
                ],
                resultTypeName: (typeName) =>
                    typeName === GraphQLOffsetDateTime.name ? GraphQLDateTime.name : typeName,
            };
        case AggregationOperator.AVERAGE:
        case AggregationOperator.SUM:
            return {
                typeNames: numberTypeNames,
            };

        case AggregationOperator.COUNT_TRUE:
        case AggregationOperator.COUNT_NOT_TRUE:
            return {
                typeNames: [GraphQLBoolean.name],
                resultTypeName: GraphQLInt.name,
            };

        case AggregationOperator.SOME_TRUE:
        case AggregationOperator.SOME_NOT_TRUE:
        case AggregationOperator.EVERY_TRUE:
        case AggregationOperator.NONE_TRUE:
            return {
                typeNames: [GraphQLBoolean.name],
                resultTypeName: GraphQLBoolean.name,
            };
        case AggregationOperator.DISTINCT:
            return {
                usesDistinct: true,
                resultIsList: true,
            };
        case AggregationOperator.COUNT_DISTINCT:
            return {
                usesDistinct: true,
                resultTypeName: GraphQLInt.name,
            };
        default:
            // this is caught in the graphql-rules validator
            return {};
    }
}

function canAggregationBeNull(operator: AggregationOperator): boolean {
    switch (operator) {
        case AggregationOperator.MAX:
        case AggregationOperator.MIN:
        case AggregationOperator.AVERAGE:
            return true;
        default:
            return false;
    }
}

const scalarTypesThatSupportDistinctAggregation: ReadonlyArray<string> = [
    GraphQLString.name,
    GraphQLID.name,
    GraphQLBoolean.name,
    GraphQLInt.name,
    GraphQLLocalDate.name,
];

function isDistinctAggregationSupported(type: Type) {
    // "simple" value object types are supported to support cases like two-field identifiers (e.g. type + key)
    if (type.isValueObjectType) {
        return getOffendingValueObjectFieldsForDistinctAggregation(type).length === 0;
    }

    return (
        type.isRootEntityType ||
        type.isChildEntityType ||
        type.isEnumType ||
        scalarTypesThatSupportDistinctAggregation.includes(type.name)
    );
}

function getOffendingValueObjectFieldsForDistinctAggregation(type: ValueObjectType) {
    return type.fields.filter(
        (field) =>
            !field.type.isEnumType &&
            !field.type.isRootEntityType &&
            !scalarTypesThatSupportDistinctAggregation.includes(field.type.name),
    );
}
