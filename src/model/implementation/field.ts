import { FieldDefinitionNode, GraphQLFloat, GraphQLInt } from 'graphql';
import memorize from 'memorize-decorator';
import { AGGREGATION_DIRECTIVE, CALC_MUTATIONS_OPERATORS, RELATION_DIRECTIVE, TRAVERSAL_DIRECTIVE } from '../../schema/constants';
import { GraphQLDateTime } from '../../schema/scalars/date-time';
import { GraphQLLocalDate } from '../../schema/scalars/local-date';
import { GraphQLLocalTime } from '../../schema/scalars/local-time';
import { CalcMutationsOperator, FieldAggregator, FieldConfig, TypeKind } from '../config';
import { ValidationMessage } from '../validation';
import { ModelComponent, ValidationContext } from '../validation/validation-context';
import { FieldPath } from './field-path';
import { FieldLocalization } from './i18n';
import { Model } from './model';
import { PermissionProfile } from './permission-profile';
import { Relation, RelationSide } from './relation';
import { RolesSpecifier } from './roles-specifier';
import { InvalidType, ObjectType, Type } from './type';

export interface SystemFieldConfig extends FieldConfig {
    readonly isSystemField?: boolean
    readonly isNonNull?: boolean
}

export class Field implements ModelComponent {
    readonly model: Model;
    readonly name: string;
    description: string | undefined;
    readonly astNode: FieldDefinitionNode | undefined;
    readonly isList: boolean;
    readonly isReference: boolean;
    readonly isRelation: boolean;
    readonly isTraversal: boolean;
    readonly isAggregation: boolean;
    readonly traversalPath: FieldPath | undefined;
    readonly aggregationPath: FieldPath | undefined;
    readonly aggregator: FieldAggregator | undefined;
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
        this.astNode = input.astNode;
        this.defaultValue = input.defaultValue;
        this.isReference = input.isReference || false;
        this.isRelation = input.isRelation || false;
        this.isTraversal = !!input.traversal;
        this.isAggregation = !!input.aggregation;
        if (input.traversal) {
            this.traversalPath = new FieldPath(input.traversal, this.declaringType);
        }
        if (input.aggregation) {
            this.aggregationPath = new FieldPath(input.aggregation, this.declaringType);
            this.aggregator = input.aggregation.aggregator;
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

    get isNonNull(): boolean {
        return this.input.isNonNull || this.isList || this.type.isEntityExtensionType;
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
        this.validateTraversal(context);
        this.validateAggregation(context);
        this.validateDefaultValue(context);
        this.validateCalcMutations(context);
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
        if (!this.isRelation && !this.isReference && !this.isTraversal) {
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

    private validateTraversal(context: ValidationContext) {
        if (!this.input.traversal) {
            return;
        }

        if (this.isRelation) {
            context.addMessage(ValidationMessage.error(`@${TRAVERSAL_DIRECTIVE} and @${RELATION_DIRECTIVE} cannot be combined.`, this.astNode));
            return;
        }
        if (!this.traversalPath) {
            context.addMessage(ValidationMessage.error(`The path cannot be empty.`, this.input.traversal.pathASTNode));
            return;
        }
        if (!this.traversalPath.validate(context)) {
            // path validation failed already
            return;
        }
        const resultingType = this.traversalPath.resultingType;
        if (resultingType && resultingType !== this.type) {
            context.addMessage(ValidationMessage.error(`The traversal path results in type "${resultingType.name}", but this field is declared with type "${this.type.name}".`, this.astNode && this.astNode.type));
            return;
        }
        if (this.traversalPath.resultIsList && !this.isList) {
            context.addMessage(ValidationMessage.error(`This field should be a declared as a list because the traversal path results in a list.`, this.astNode && this.astNode.type));
            return;
        }
        if (!this.traversalPath.resultIsList && this.isList) {
            context.addMessage(ValidationMessage.error(`This field should not be a declared as a list because the traversal path does not result in a list.`, this.astNode && this.astNode.type));
            return;
        }
    }

    private validateAggregation(context: ValidationContext) {
        if (!this.input.aggregation || !this.aggregator) { // missing aggregator is a graphql-rules error
            return;
        }
        if (this.isRelation) {
            context.addMessage(ValidationMessage.error(`@${AGGREGATION_DIRECTIVE} and @${RELATION_DIRECTIVE} cannot be combined.`, this.astNode));
            return;
        }
        if (this.isTraversal) {
            context.addMessage(ValidationMessage.error(`@${AGGREGATION_DIRECTIVE} and @${TRAVERSAL_DIRECTIVE} cannot be combined.`, this.astNode));
            return;
        }
        if (!this.aggregationPath) {
            context.addMessage(ValidationMessage.error(`The path cannot be empty.`, this.input.aggregation.pathASTNode));
            return;
        }

        if (!this.aggregationPath.validate(context)) {
            // path validation failed already
            return;
        }
        if (!this.aggregationPath.resultIsList) {
            context.addMessage(ValidationMessage.error(`The path does not result in a list and thus cannot be used in an aggregation.`, this.input.aggregation.pathASTNode));
            return;
        }
        const resultingType = this.aggregationPath.resultingType;
        if (this.aggregator === FieldAggregator.COUNT) {
            if (this.type.name !== GraphQLInt.name) {
                context.addMessage(ValidationMessage.error(`The type of an @${AGGREGATION_DIRECTIVE} field with aggregator "${FieldAggregator.COUNT}" should be "${GraphQLInt.name}".`, this.astNode && this.astNode.type));
            }
        } else {
            const supportedTypeNames = getSupportedTypeNames(this.aggregator);
            if (resultingType && supportedTypeNames && !supportedTypeNames.includes(resultingType.name)) {
                context.addMessage(ValidationMessage.error(`Aggregator "${this.aggregator}" is not supported on type "${resultingType.name}" (supported types: ${supportedTypeNames.map(t => `"${t}"`).join(', ')}).`,
                    this.input.aggregation.aggregatorASTNode));
                return;
            }
            if (resultingType && resultingType !== this.type) {
                context.addMessage(ValidationMessage.error(`The aggregation results in type "${resultingType.name}", but this field is declared with type "${this.type.name}".`, this.astNode && this.astNode.type));
                return;
            }
        }

        if (this.isList) {
            context.addMessage(ValidationMessage.error(`This @${AGGREGATION_DIRECTIVE} field should not be a list.`, this.astNode && this.astNode.type));
            return;
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

        if (this.isList) {
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

        if (this.isTraversal && (permissions.permissionProfileName || permissions.roles)) {
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

        if (this.isTraversal) {
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
}

function getSupportedTypeNames(aggregator: FieldAggregator): ReadonlyArray<string>|undefined {
    switch (aggregator) {
        case FieldAggregator.COUNT:
            return undefined;
        case FieldAggregator.MAX:
        case FieldAggregator.MIN:
            return [
                GraphQLInt.name, GraphQLFloat.name, GraphQLDateTime.name, GraphQLLocalDate.name, GraphQLLocalTime.name
            ];
        case FieldAggregator.AVERAGE:
        case FieldAggregator.SUM:
            return [
                GraphQLInt.name, GraphQLFloat.name
            ];
        default:
            // this is caught in the graphql-rules validator
            return undefined;
    }
}
