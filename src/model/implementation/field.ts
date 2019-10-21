import { FieldDefinitionNode, GraphQLBoolean, GraphQLFloat, GraphQLID, GraphQLInt, GraphQLString } from 'graphql';
import memorize from 'memorize-decorator';
import { ACCESS_GROUP_FIELD, CALC_MUTATIONS_OPERATORS, COLLECT_AGGREGATE_ARG, COLLECT_DIRECTIVE, FLEX_SEARCH_INCLUDED_IN_SEARCH_ARGUMENT, RELATION_DIRECTIVE } from '../../schema/constants';
import { GraphQLDateTime } from '../../schema/scalars/date-time';
import { GraphQLLocalDate } from '../../schema/scalars/local-date';
import { GraphQLLocalTime } from '../../schema/scalars/local-time';
import { AggregationOperator, CalcMutationsOperator, FieldConfig, FlexSearchLanguage, TypeKind } from '../config';
import { ValidationMessage } from '../validation';
import { ModelComponent, ValidationContext } from '../validation/validation-context';
import { CollectPath } from './collect-path';
import { FieldLocalization } from './i18n';
import { Model } from './model';
import { PermissionProfile } from './permission-profile';
import { Relation, RelationSide } from './relation';
import { RolesSpecifier } from './roles-specifier';
import { InvalidType, ObjectType, Type } from './type';
import { ValueObjectType } from './value-object-type';

export interface SystemFieldConfig extends FieldConfig {
    readonly isSystemField?: boolean
    readonly isNonNull?: boolean
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
    readonly roles: RolesSpecifier | undefined;
    private _type: Type | undefined;

    /**
     * Indicates if this is an inherent field of the declaring type that will be maintained by the system and thus can
     * only be queried
     */
    readonly isSystemField: boolean;

    constructor(private readonly input: SystemFieldConfig, public readonly declaringType: ObjectType) {
        this.model = declaringType.model;
        this.name = input.name;
        this.description = input.description;
        this.deprecationReason = input.deprecationReason;
        this.astNode = input.astNode;
        this.defaultValue = input.defaultValue;
        this.isReference = input.isReference || false;
        this.isRelation = input.isRelation || false;
        this.isCollectField = !!input.collect;
        if (input.collect) {
            this.collectPath = new CollectPath(input.collect, this.declaringType);
            if (input.collect) {
                this.aggregationOperator = input.collect.aggregationOperator;
            }
        }
        this.isList = input.isList || false;
        this.calcMutationOperators = new Set(input.calcMutationOperators || []);
        this.roles = input.permissions && input.permissions.roles ? new RolesSpecifier(input.permissions.roles) : undefined;
        this.isSystemField = input.isSystemField || false;
    }

    /**
     * Indicates if this field can never be set manually (independent of permissions)
     */
    get isReadOnly(): boolean {
        return this.isSystemField;
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

    public get permissionProfile(): PermissionProfile | undefined {
        if (!this.input.permissions || this.input.permissions.permissionProfileName == undefined) {
            return undefined;
        }
        return this.declaringType.namespace.getPermissionProfile(this.input.permissions.permissionProfileName);
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
        return this.type.isObjectType ? this.type.fields.find(field => field.inverseOf === this) : undefined;
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
        if (!this.isRelation || !this.declaringType.isRootEntityType || !this.type.isRootEntityType) {
            return undefined;
        }
        if (this.inverseOf) {
            // this is the to side
            return new Relation({
                fromType: this.type,
                fromField: this.inverseOf,
                toType: this.declaringType,
                toField: this
            }).toSide;
        } else {
            // this is the from side
            return new Relation({
                fromType: this.declaringType,
                fromField: this,
                toType: this.type,
                toField: this.inverseField
            }).fromSide;
        }
    }

    public getRelationSideOrThrow(): RelationSide {
        if (this.type.kind != TypeKind.ROOT_ENTITY) {
            throw new Error(`Expected the type of field "${this.declaringType.name}.${this.name}" to be a root entity, but "${this.type.name}" is a ${this.type.kind}`);
        }
        if (this.declaringType.kind != TypeKind.ROOT_ENTITY) {
            throw new Error(`Expected "${this.declaringType.name}" to be a root entity, but is ${this.declaringType.kind}`);
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
            throw new Error(`Expected "${this.declaringType.name}.${this.name}" to be a reference but it is not`);
        }
        return keyField;
    }

    /**
     * A reference field within the same type that uses this field as its key field
     */
    @memorize()
    get referenceField(): Field | undefined {
        return this.declaringType.fields.filter(f => f.referenceKeyField === this)[0];
    }

    public getLocalization(resolutionOrder: ReadonlyArray<string>): FieldLocalization {
        return this.model.i18n.getFieldLocalization(this, resolutionOrder);
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
        this.validateFlexSearch(context);
    }

    private validateName(context: ValidationContext) {
        if (!this.name) {
            context.addMessage(ValidationMessage.error(`Field name is empty.`, this.astNode));
            return;
        }

        // Leading underscores are reserved for internal names, like ArangoDB's _key field
        if (this.name.startsWith('_')) {
            context.addMessage(ValidationMessage.error(`Field names cannot start with an underscore.`, this.astNode));
            return;
        }

        // some naming convention rules

        if (this.name.includes('_')) {
            context.addMessage(ValidationMessage.warn(`Field names should not include underscores.`, this.astNode));
            return;
        }

        if (!this.name.match(/^[a-z]/)) {
            context.addMessage(ValidationMessage.warn(`Field names should start with a lowercase character.`, this.astNode));
        }
    }

    private validateType(context: ValidationContext) {
        if (!this.model.getType(this.input.typeName)) {
            context.addMessage(ValidationMessage.error(`Type "${this.input.typeName}" not found.`, this.input.typeNameAST || this.astNode));
        }
    }

    private validateRootEntityType(context: ValidationContext) {
        // this does not fit anywhere else properly
        if (this.isReference && this.isRelation) {
            context.addMessage(ValidationMessage.error(`@reference and @relation cannot be combined.`, this.astNode));
        }

        if (this.type.kind !== TypeKind.ROOT_ENTITY) {
            return;
        }

        // root entities are not embeddable
        if (!this.isRelation && !this.isReference && !this.isCollectField) {
            if (this.declaringType.kind == TypeKind.VALUE_OBJECT) {
                context.addMessage(ValidationMessage.error(`Type "${this.type.name}" is a root entity type and cannot be embedded. Consider adding @reference.`, this.astNode));
            } else {
                context.addMessage(ValidationMessage.error(`Type "${this.type.name}" is a root entity type and cannot be embedded. Consider adding @reference or @relation.`, this.astNode));
            }
        }
    }

    private validateRelation(context: ValidationContext) {
        if (!this.isRelation) {
            return;
        }

        if (this.declaringType.kind !== TypeKind.ROOT_ENTITY) {
            context.addMessage(ValidationMessage.error(`Relations can only be defined on root entity types. Consider using @reference instead.`, this.astNode));
        }

        // do target type validations only if it resolved correctly
        if (!this.hasValidType) {
            return;
        }

        if (this.type.kind !== TypeKind.ROOT_ENTITY) {
            context.addMessage(ValidationMessage.error(`Type "${this.type.name}" cannot be used with @relation because it is not a root entity type.`, this.astNode));
            return;
        }

        if (this.input.inverseOfFieldName != undefined) {
            const inverseOf = this.type.getField(this.input.inverseOfFieldName);
            const inverseFieldDesc = `Field "${this.type.name}.${this.input.inverseOfFieldName}" used as inverse field of "${this.declaringType.name}.${this.name}"`;
            if (!inverseOf) {
                context.addMessage(ValidationMessage.error(`Field "${this.input.inverseOfFieldName}" does not exist on type "${this.type.name}".`, this.input.inverseOfASTNode || this.astNode));
            } else if (inverseOf.type && inverseOf.type !== this.declaringType) {
                context.addMessage(ValidationMessage.error(`${inverseFieldDesc} has named type "${inverseOf.type.name}" but should be of type "${this.declaringType.name}".`, this.input.inverseOfASTNode || this.astNode));
            } else if (!inverseOf.isRelation) {
                context.addMessage(ValidationMessage.error(`${inverseFieldDesc} does not have the @relation directive.`, this.input.inverseOfASTNode || this.astNode));
            } else if (inverseOf.inverseOf != undefined) {
                context.addMessage(ValidationMessage.error(`${inverseFieldDesc} should not declare inverseOf itself.`, this.input.inverseOfASTNode || this.astNode));
            }
        } else {
            // look for @relation(inverseOf: "thisField") in the target type
            const inverseFields = this.type.fields.filter(field => field.inverseOf === this);
            if (inverseFields.length === 0) {
                // no @relation(inverseOf: "thisField") - should be ok, but is suspicious if there is a matching @relation back to this type
                // (look for inverseOfFieldName instead of inverseOf so that we don't emit this warning if the inverseOf config is invalid)
                const matchingRelation = this.type.fields.find(field => field !== this && field.isRelation && field.type === this.declaringType && field.input.inverseOfFieldName == undefined);
                if (matchingRelation) {
                    context.addMessage(ValidationMessage.warn(`This field and "${matchingRelation.declaringType.name}.${matchingRelation.name}" define separate relations. Consider using the "inverseOf" argument to add a backlink to an existing relation.`, this.astNode));
                }
            } else if (inverseFields.length > 1) {
                const names = inverseFields.map(f => `"${this.type.name}.${f.name}"`).join(', ');
                // found multiple inverse fields - this is an error
                // check this here and not in the inverse fields so we don't report stuff twice
                for (const inverseField of inverseFields) {
                    context.addMessage(ValidationMessage.error(`Multiple fields (${names}) declare inverseOf to "${this.declaringType.name}.${this.name}".`, inverseField.astNode));
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
            context.addMessage(ValidationMessage.error(`"${this.type.name}" cannot be used as @reference type because is not a root entity type.`, this.astNode));
            return;
        }

        if (this.isList) {
            context.addMessage(ValidationMessage.error(`@reference is not supported with list types. Consider wrapping the reference in a child entity or value object type.`, this.astNode));
        }

        if (!this.type.keyField) {
            context.addMessage(ValidationMessage.error(`"${this.type.name}" cannot be used as @reference type because it does not have a field annotated with @key.`, this.astNode));
        }

        this.validateReferenceKeyField(context);
    }

    private validateCollect(context: ValidationContext) {
        if (!this.input.collect) {
            return;
        }

        if (this.isRelation) {
            context.addMessage(ValidationMessage.error(`@${COLLECT_DIRECTIVE} and @${RELATION_DIRECTIVE} cannot be combined.`, this.astNode));
            return;
        }
        if (!this.collectPath) {
            context.addMessage(ValidationMessage.error(`The path cannot be empty.`, this.input.collect.pathASTNode));
            return;
        }
        if (!this.collectPath.validate(context)) {
            // path validation failed already
            return;
        }
        const resultingType = this.collectPath.resultingType;

        if (!this.collectPath.resultIsList) {
            context.addMessage(ValidationMessage.error(`The path does not result in a list.`, this.input.collect.aggregationOperatorASTNode));
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
                        context.addMessage(ValidationMessage.error(`Aggregation operator "${this.aggregationOperator}" is only allowed if the last path segment is a list field. "${lastSegment.field.name}" is of type "Boolean", so you may want to use "${this.aggregationOperator + '_TRUE'}".`, this.input.collect.aggregationOperatorASTNode));
                    } else if (lastSegment.isNullableSegment) {
                        // show extended hint - user might have wanted to use e.g. "COUNT_NOT_NULL".
                        context.addMessage(ValidationMessage.error(`Aggregation operator "${this.aggregationOperator}" is only allowed if the last path segment is a list field. If you want to exclude objects where "${lastSegment.field.name}" is null, use "${this.aggregationOperator + '_NOT_NULL'}; otherwise, remove "${lastSegment.field.name}" from the path.`, this.input.collect.aggregationOperatorASTNode));
                    } else {
                        context.addMessage(ValidationMessage.error(`Aggregation operator "${this.aggregationOperator}" is only allowed if the last path segment is a list field. Please remove "${lastSegment.field.name}" from the path.`, this.input.collect.aggregationOperatorASTNode));
                    }
                    return;
                }

                // even for boolean lists, we show a warning because boolean lists are sparingly used and e.g. using EVERY might be misleading there
                if (lastSegment && lastSegment.field.type.name === GraphQLBoolean.name) {
                    context.addMessage(ValidationMessage.warn(`Aggregation operator "${this.aggregationOperator}" only checks the number of items. "${lastSegment.field.name}" is of type "Boolean", so you may want to use the operator "${this.aggregationOperator + '_TRUE'}" instead which specifically checks for boolean "true".`, this.input.collect.aggregationOperatorASTNode));
                }
            }
            if (typeInfo.shouldBeNullable && !this.collectPath.resultIsNullable) {
                let addendum = '';
                const operatorName = this.aggregationOperator.toString();
                if (operatorName.endsWith('_NOT_NULL')) {
                    addendum = ` Consider using "${operatorName.substr(0, operatorName.length - '_NOT_NULL'.length)}`;
                }
                context.addMessage(ValidationMessage.error(`Aggregation operator "${this.aggregationOperator}" is only supported on nullable types, but the path does not result in a nullable type.` + addendum,
                    this.input.collect.aggregationOperatorASTNode));
                return;
            }
            if (resultingType && typeInfo.typeNames && !typeInfo.typeNames.includes(resultingType.name)) {
                context.addMessage(ValidationMessage.error(`Aggregation operator "${this.aggregationOperator}" is not supported on type "${resultingType.name}" (supported types: ${typeInfo.typeNames.map(t => `"${t}"`).join(', ')}).`,
                    this.input.collect.aggregationOperatorASTNode));
                return;
            }

            if (typeInfo.usesDistinct && resultingType) {
                if (!isDistinctAggregationSupported(resultingType)) {
                    let typeHint;
                    if (resultingType.isValueObjectType) {
                        const offendingFields = getOffendingValueObjectFieldsForDistinctAggregation(resultingType);
                        const offendingFieldNames = offendingFields.map(f => `"${f.name}"`).join(', ');
                        typeHint = `value object type "${resultingType.name}" because its field${offendingFields.length !== 1 ? 's' : ''} ${offendingFieldNames} has a type that does not support this operator`;
                    } else if (resultingType.isEntityExtensionType) {
                        typeHint = `entity extension types. You can instead collect the parent objects by removing the last path segment`;
                    } else {
                        typeHint = `type "${resultingType.name}" (supported scalar types: ${scalarTypesThatSupportDistinctAggregation.map(t => `"${t}"`).join(', ')})`;
                    }
                    context.addMessage(ValidationMessage.error(`Aggregation operator "${this.aggregationOperator}" is not supported on ${typeHint}.`,
                        this.input.collect.aggregationOperatorASTNode));
                    return;
                }
                // the operator is useless if it's an entity type and it can neither be null nor have duplicates
                if ((resultingType.isRootEntityType || resultingType.isChildEntityType) && !this.collectPath.resultIsNullable && !this.collectPath.resultMayContainDuplicateEntities) {
                    const suggestedOperator = getAggregatorWithoutDistinct(this.aggregationOperator);
                    if (this.aggregationOperator === AggregationOperator.DISTINCT) {
                        // this one can just be removed
                        context.addMessage(ValidationMessage.error(`Aggregation operator "${this.aggregationOperator}" is not needed because the collect result can neither contain duplicate entities nor null values. Please remove the "${COLLECT_AGGREGATE_ARG}" argument".`, this.input.collect.aggregationOperatorASTNode));
                        return;
                    } else if (suggestedOperator) {
                        // the count operator should be replaced by the non-distinct count
                        context.addMessage(ValidationMessage.error(`Please use the operator "${suggestedOperator}" because the collect result can neither contain duplicate entities nor null values.".`, this.input.collect.aggregationOperatorASTNode));
                        return;
                    }
                }
            }

            const expectedResultingTypeName = typeInfo.resultTypeName || (resultingType && resultingType.name); // undefined means that the aggregation results in the item's type
            if (expectedResultingTypeName && this.type.name !== expectedResultingTypeName) {
                context.addMessage(ValidationMessage.error(`The aggregation results in type "${expectedResultingTypeName}", but this field is declared with type "${this.type.name}".`, this.astNode && this.astNode.type));
                return;
            }

            if (!typeInfo.resultIsList && this.isList) {
                context.addMessage(ValidationMessage.error(`This aggregation field should not be declared as a list.`, this.astNode && this.astNode.type));
                return;
            }

            if (typeInfo.resultIsList && !this.isList) {
                context.addMessage(ValidationMessage.error(`This aggregation field should be declared as a list because "${this.aggregationOperator}" results in a list.`, this.astNode && this.astNode.type));
                return;
            }
        } else {
            // not an aggregation

            if (resultingType) {
                if (resultingType.isEntityExtensionType) {
                    // treat these separate from the list below because we can't even aggregate entity extensions (they're not nullable and not lists)
                    context.addMessage(ValidationMessage.error(`The collect path results in entity extension type "${resultingType.name}", but entity extensions cannot be collected. You can either collect the parent entity by removing the last path segment, or collect values within the entity extension by adding a path segment.`, this.input.collect.pathASTNode));
                    return;
                }
                if (resultingType.isEnumType || resultingType.isScalarType || resultingType.isValueObjectType) {
                    // this is a modeling design choice - it does not really make sense to "collect" non-entities without a link to the parent and without aggregating them
                    const typeKind = resultingType.isEnumType ? 'enum' : resultingType.isValueObjectType ? 'value object' : 'scalar';
                    const suggestion = isDistinctAggregationSupported(resultingType) ? ` You may want to use the "${AggregationOperator.DISTINCT}" aggregation.` : `You can either collect the parent entity by removing the last path segment, or add the "aggregate" argument to aggregate the values.`;
                    context.addMessage(ValidationMessage.error(`The collect path results in ${typeKind} type "${resultingType.name}", but ${typeKind}s cannot be collected without aggregating them. ` + suggestion, this.input.collect.pathASTNode));
                    return;
                }
                if (this.collectPath.resultMayContainDuplicateEntities) {
                    const minimumAmbiguousPathEndIndex = this.collectPath.segments.findIndex(s => s.resultMayContainDuplicateEntities);
                    const firstAmgiguousSegment = this.collectPath.segments[minimumAmbiguousPathEndIndex];
                    const minimumAmbiguousPathPrefix = minimumAmbiguousPathEndIndex >= 0 ? this.collectPath.path.split('.').slice(0, minimumAmbiguousPathEndIndex + 1).join('.') : '';
                    const firstAmbiguousSegment = this.collectPath.segments.find(s => s.resultMayContainDuplicateEntities);
                    const path = minimumAmbiguousPathPrefix && minimumAmbiguousPathPrefix !== this.collectPath.path ? `path prefix "${minimumAmbiguousPathPrefix}"` : 'path';
                    const entityType = firstAmgiguousSegment ? `${firstAmgiguousSegment.field.type.name} entities` : `entities`;
                    let reason = '';
                    if (firstAmbiguousSegment && firstAmbiguousSegment.kind === 'relation') {
                        if (firstAmbiguousSegment.relationSide.targetField) {
                            reason = ` (because "${firstAmbiguousSegment.relationSide.targetType.name}.${firstAmbiguousSegment.relationSide.targetField.name}", which is the inverse relation field to "${firstAmgiguousSegment.field.declaringType.name}.${firstAmbiguousSegment.field.name}", is declared as a list)`;
                        } else {
                            reason = ` (because the relation target type "${firstAmbiguousSegment.relationSide.targetType.name}" does not declare a inverse relation field to "${firstAmgiguousSegment.field.declaringType.name}.${firstAmbiguousSegment.field.name}")`;
                        }
                    }
                    context.addMessage(ValidationMessage.error(`The ${path} can produce duplicate ${entityType}${reason}. Please set argument "${COLLECT_AGGREGATE_ARG}" to "${AggregationOperator.DISTINCT}" to filter out duplicates and null items if you don't want any other aggregation.`, this.input.collect.pathASTNode));
                    return;
                }
                if (this.collectPath.resultIsNullable) {
                    let fieldHint = '';
                    const lastNullableSegment = [...this.collectPath.segments].reverse().find(s => s.isNullableSegment);
                    if (lastNullableSegment) {
                        fieldHint = ` because "${lastNullableSegment.field.declaringType.name}.${lastNullableSegment.field.name}" can be null`;
                    }
                    context.addMessage(ValidationMessage.error(`The collect path can produce items that are null${fieldHint}. Please set argument "${COLLECT_AGGREGATE_ARG}" to "${AggregationOperator.DISTINCT}" to filter out null items if you don't want any other aggregation.`, this.input.collect.pathASTNode));
                    return;
                }

                if (resultingType !== this.type) {
                    context.addMessage(ValidationMessage.error(`The collect path results in type "${resultingType.name}", but this field is declared with type "${this.type.name}".`, this.astNode && this.astNode.type));
                    return;
                }
            }
            if (!this.isList) {
                context.addMessage(ValidationMessage.error(`This collect field should be a declared as a list.`, this.astNode && this.astNode.type));
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
            context.addMessage(ValidationMessage.error(`Field "${this.declaringType.name}.${this.input.referenceKeyField}" not found.`, this.input.referenceKeyFieldASTNode));
            return;
        }

        if (keyField.isSystemField) {
            context.addMessage(ValidationMessage.error(`"${this.declaringType.name}.${this.input.referenceKeyField}" is a system field and cannot be used as keyField of a @reference.`, this.input.referenceKeyFieldASTNode));
            return;
        }

        // the following can only be validated if the target type is valid
        if (!this.type.isRootEntityType || !this.type.keyField) {
            return;
        }

        const targetKeyField = this.type.keyField;

        if (targetKeyField.type !== keyField.type) {
            context.addMessage(ValidationMessage.error(`The type of the keyField "${this.declaringType.name}.${this.input.referenceKeyField}" ("${keyField.type.name}") must be the same as the type of the @key-annotated field "${this.type.name}.${targetKeyField.name}" ("${targetKeyField.type.name}")`, this.input.referenceKeyFieldASTNode));
            return;
        }

        // we leave type validation (scalar etc.) to the @key annotation

        // there can only be one reference for each key field
        // each reference just reports an error on itself so that all fields are highlighted
        if (this.declaringType.fields.some(f => f !== this && f.referenceKeyField === keyField)) {
            context.addMessage(ValidationMessage.error(`There are multiple references declared for keyField "${this.input.referenceKeyField}".`, this.input.referenceKeyFieldASTNode));
        }
    }

    private validateEntityExtensionType(context: ValidationContext) {
        if (this.type.kind !== TypeKind.ENTITY_EXTENSION) {
            return;
        }

        if (this.declaringType.kind === TypeKind.VALUE_OBJECT) {
            context.addMessage(ValidationMessage.error(`Type "${this.type.name}" is an entity extension type and cannot be used within value object types. Change "${this.declaringType.name}" to an entity extension type or use a value object type for "${this.name}".`, this.astNode));
            return;
        }

        if (this.isList && !this.isCollectField) {
            // don't print this error if it's used with @collect - it will fail due to @collect, and the message here would not be helpful.
            context.addMessage(ValidationMessage.error(`Type "${this.type.name}" is an entity extension type and cannot be used in a list. Change the field type to "${this.type.name}" (without brackets), or use a child entity or value object type instead.`, this.astNode));
        }
    }

    private validateChildEntityType(context: ValidationContext) {
        if (this.type.kind !== TypeKind.CHILD_ENTITY) {
            return;
        }

        if (this.declaringType.kind === TypeKind.VALUE_OBJECT) {
            context.addMessage(ValidationMessage.error(`Type "${this.type.name}" is a child entity type and cannot be used within value object types. Change "${this.declaringType.name}" to an entity extension type or use a value object type for "${this.name}".`, this.astNode));
            return;
        }

        if (!this.isList) {
            context.addMessage(ValidationMessage.error(`Type "${this.type.name}" is a child entity type and can only be used in a list. Change the field type to "[${this.type.name}]", or use an entity extension or value object type instead.`, this.astNode));
        }
    }

    private validatePermissions(context: ValidationContext) {
        const permissions = this.input.permissions || {};

        if (this.isCollectField && (permissions.permissionProfileName || permissions.roles)) {
            context.addMessage(ValidationMessage.error(`Permissions to @traversal fields cannot be restricted explicitly (permissions of traversed fields and types are applied automatically).`, this.astNode));
            return;
        }

        if (permissions.permissionProfileName != undefined && permissions.roles != undefined) {
            const message = `Permission profile and explicit role specifiers cannot be combined.`;
            context.addMessage(ValidationMessage.error(message, permissions.permissionProfileNameAstNode || this.input.astNode));
            context.addMessage(ValidationMessage.error(message, permissions.roles.astNode || this.input.astNode));
        }

        if (permissions.permissionProfileName != undefined && !this.declaringType.namespace.getPermissionProfile(permissions.permissionProfileName)) {
            context.addMessage(ValidationMessage.error(`Permission profile "${permissions.permissionProfileName}" not found.`, permissions.permissionProfileNameAstNode || this.input.astNode));
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
            context.addMessage(ValidationMessage.error(`Default values are not supported on relations.`, this.input.defaultValueASTNode || this.astNode));
            return;
        }

        if (this.isCollectField) {
            context.addMessage(ValidationMessage.error(`Default values are not supported on traversal fields.`, this.input.defaultValueASTNode || this.astNode));
            return;
        }

        context.addMessage(ValidationMessage.info(`Take care, there are no type checks for default values yet.`, this.input.defaultValueASTNode || this.astNode));
    }

    private validateCalcMutations(context: ValidationContext) {
        if (!this.calcMutationOperators.size) {
            return;
        }

        if (this.isList) {
            context.addMessage(ValidationMessage.error(`Calc mutations are not supported on list fields.`, this.astNode));
            return;
        }

        const supportedOperators = CALC_MUTATIONS_OPERATORS.filter(op => op.supportedTypes.includes(this.type.name));
        const supportedOperatorsDesc = supportedOperators.map(op => '"' + op.name + '"').join(', ');

        if (this.calcMutationOperators.size > 0 && !supportedOperators.length) {
            context.addMessage(ValidationMessage.error(`Type "${this.type.name}" does not support any calc mutation operators.`, this.astNode));
            return;
        }

        for (const operator of this.calcMutationOperators) {
            const desc = CALC_MUTATIONS_OPERATORS.find(op => op.name == operator);
            if (!desc) {
                // this is caught in the graphql-rules validator
                continue;
            }

            if (!(desc.supportedTypes.includes(this.type.name))) {
                context.addMessage(ValidationMessage.error(`Calc mutation operator "${operator}" is not supported on type "${this.type.name}" (supported operators: ${supportedOperatorsDesc}).`, this.astNode));
            }
        }
    }

    private validateFlexSearch(context: ValidationContext) {
        const notSupportedOn = `@flexSearch is not supported on`;
        if (this.isFlexSearchIndexed && (this.isReference || this.isRelation || this.isCollectField)) {
            if (this.isReference) {
                context.addMessage(ValidationMessage.error(`${notSupportedOn} references.`, this.input.isFlexSearchIndexedASTNode));
            } else if (this.isRelation) {
                context.addMessage(ValidationMessage.error(`${notSupportedOn} relations.`, this.input.isFlexSearchIndexedASTNode));
            } else if (this.isCollectField) {
                context.addMessage(ValidationMessage.error(`${notSupportedOn} collect fields.`, this.input.isFlexSearchIndexedASTNode));
            }
            return;
        }
        if (this.isFlexSearchFulltextIndexed && !(this.type.isScalarType && this.type.name === 'String')) {
            context.addMessage(ValidationMessage.error(`@flexSearchFulltext is not supported on type "${this.type.name}".`, this.input.isFlexSearchFulltextIndexedASTNode));
            return;
        }
        if (this.isFlexSearchFulltextIndexed && this.isCollectField) {
            context.addMessage(ValidationMessage.error(`${notSupportedOn} collect fields.`, this.input.isFlexSearchFulltextIndexedASTNode));
            return;
        }
        if (this.isFlexSearchFulltextIndexed && !this.flexSearchLanguage) {
            context.addMessage(ValidationMessage.error(`@flexSearchFulltext requires either a "language" parameter, or a "flexSearchLanguage" must be set in the defining type.`, this.input.isFlexSearchFulltextIndexedASTNode));
        }
        if (this.isFlexSearchIndexed && (this.type.isEntityExtensionType || this.type.isValueObjectType) && !this.type.fields.some(value => value.isFlexSearchIndexed || value.isFlexSearchFulltextIndexed)) {
            context.addMessage(ValidationMessage.error(`At least one field on type "${this.type.name}" must be annotated with @flexSearch or @flexSearchFulltext if @flexSearch is specified on the type declaration.`, this.input.isFlexSearchIndexedASTNode));
        }
        if (this.name === ACCESS_GROUP_FIELD && this.declaringType.isRootEntityType && this.declaringType.permissionProfile
            && this.declaringType.permissionProfile.permissions.some(value => value.restrictToAccessGroups) && this.declaringType.flexSearchIndexConfig.isIndexed && !this.isFlexSearchIndexed) {
            context.addMessage(ValidationMessage.error(`The permission profile "${this.declaringType.permissionProfile.name}" uses "restrictToAccessGroups", ` +
                `and this fields defining type is marked with "flexSearch: true", but this field is not marked with "@flexSearch".`, this.astNode));
        }
        if (this.isIncludedInSearch && !(this.type.isScalarType && this.type.name === 'String')) {
            context.addMessage(ValidationMessage.error(`"${FLEX_SEARCH_INCLUDED_IN_SEARCH_ARGUMENT}: true" is only supported on type "String" and "[String]".`, this.input.isFlexSearchFulltextIndexedASTNode));
            return;
        }

    }

    get isFlexSearchIndexed(): boolean {
        return !!this.input.isFlexSearchIndexed;
    }

    get isFlexSearchFulltextIndexed(): boolean {
        return !!this.input.isFlexSearchFulltextIndexed;
    }

    get isIncludedInSearch(): boolean {
        return !!this.input.isIncludedInSearch && this.isFlexSearchIndexed;
    }

    get isFulltextIncludedInSearch(): boolean {
        return !!this.input.isFulltextIncludedInSearch && this.isFlexSearchFulltextIndexed;
    }

    get flexSearchLanguage(): FlexSearchLanguage | undefined {
        return this.input.flexSearchLanguage || this.declaringType.flexSearchLanguage;
    }
}

function getAggregatorWithoutDistinct(aggregator: AggregationOperator): AggregationOperator | undefined {
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
    readonly typeNames?: ReadonlyArray<string> | undefined
    readonly lastSegmentShouldBeList?: boolean
    readonly shouldBeNullable?: boolean
    readonly resultTypeName?: string
    readonly resultIsList?: boolean
    readonly usesDistinct?: boolean
} {
    switch (aggregator) {
        case AggregationOperator.COUNT:
            return {
                lastSegmentShouldBeList: true,
                resultTypeName: GraphQLInt.name
            };
        case AggregationOperator.SOME:
        case AggregationOperator.NONE:
            return {
                lastSegmentShouldBeList: true,
                resultTypeName: GraphQLBoolean.name
            };

        case AggregationOperator.COUNT_NULL:
        case AggregationOperator.COUNT_NOT_NULL:
            return {
                shouldBeNullable: true,
                resultTypeName: GraphQLInt.name
            };
        case AggregationOperator.SOME_NULL:
        case AggregationOperator.SOME_NOT_NULL:
        case AggregationOperator.EVERY_NULL:
        case AggregationOperator.NONE_NULL:
            return {
                shouldBeNullable: true,
                resultTypeName: GraphQLBoolean.name
            };

        case AggregationOperator.MAX:
        case AggregationOperator.MIN:
            return {
                typeNames: [
                    GraphQLInt.name, GraphQLFloat.name, GraphQLDateTime.name, GraphQLLocalDate.name,
                    GraphQLLocalTime.name
                ]
            };
        case AggregationOperator.AVERAGE:
        case AggregationOperator.SUM:
            return {
                typeNames: [
                    GraphQLInt.name, GraphQLFloat.name
                ]
            };

        case AggregationOperator.COUNT_TRUE:
        case AggregationOperator.COUNT_NOT_TRUE:
            return {
                typeNames: [
                    GraphQLBoolean.name
                ],
                resultTypeName: GraphQLInt.name
            };

        case AggregationOperator.SOME_TRUE:
        case AggregationOperator.SOME_NOT_TRUE:
        case AggregationOperator.EVERY_TRUE:
        case AggregationOperator.NONE_TRUE:
            return {
                typeNames: [
                    GraphQLBoolean.name
                ],
                resultTypeName: GraphQLBoolean.name
            };
        case AggregationOperator.DISTINCT:
            return {
                usesDistinct: true,
                resultIsList: true
            };
        case AggregationOperator.COUNT_DISTINCT:
            return {
                usesDistinct: true,
                resultTypeName: GraphQLInt.name
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
    GraphQLString.name, GraphQLID.name, GraphQLBoolean.name, GraphQLInt.name, GraphQLLocalDate.name
];

function isDistinctAggregationSupported(type: Type) {
    // "simple" value object types are supported to support cases like two-field identifiers (e.g. type + key)
    if (type.isValueObjectType) {
        return getOffendingValueObjectFieldsForDistinctAggregation(type).length === 0;
    }

    return type.isRootEntityType || type.isChildEntityType || type.isEnumType || scalarTypesThatSupportDistinctAggregation.includes(type.name);
}

function getOffendingValueObjectFieldsForDistinctAggregation(type: ValueObjectType) {
    return type.fields.filter(field => !field.type.isEnumType && !field.type.isRootEntityType && !scalarTypesThatSupportDistinctAggregation.includes(field.type.name));
}
