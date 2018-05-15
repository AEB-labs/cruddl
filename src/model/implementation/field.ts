import { CalcMutationsOperator, FieldInput, TypeKind } from '../input';
import { ModelComponent, ValidationContext } from './validation';
import { ValidationMessage } from '../validation';
import { FieldDefinitionNode } from 'graphql';
import { ObjectType, Type } from './type';
import { PermissionProfile } from '../../authorization/permission-profile';
import { Model } from './model';
import { CALC_MUTATIONS_OPERATORS } from '../../schema/schema-defaults';

export interface RolesSpecifier {
    readonly read: ReadonlyArray<string>
    readonly readWrite: ReadonlyArray<string>
}

export class Field implements ModelComponent {
    readonly model: Model;
    readonly name: string;
    readonly description: string|undefined;
    readonly astNode: FieldDefinitionNode|undefined;
    readonly isList: boolean;
    readonly isReference: boolean;
    readonly isRelation: boolean;
    readonly defaultValue?: any;
    readonly calcMutationOperators: ReadonlySet<CalcMutationsOperator>;
    readonly roles: RolesSpecifier|undefined;
    readonly isSystemField: boolean;

    public get type(): Type {
        return this.model.getTypeOrFallback(this.input.typeName);
    }

    public get hasValidType(): boolean {
        return !!this.model.getType(this.input.typeName);
    }

    public get permissionProfile(): PermissionProfile|undefined {
        if (!this.input.permissions || this.input.permissions.permissionProfileName == undefined) {
            return undefined;
        }
        return this.model.getPermissionProfile(this.input.permissions.permissionProfileName);
    }

    public get inverseOf(): Field|undefined {
        if (this.input.inverseOfFieldName == undefined) {
            return undefined;
        }
        const type = this.type;
        if (!type.isObjectType) {
            return undefined;
        }
        return type.getField(this.input.inverseOfFieldName);
    }

    public get inverseField(): Field|undefined {
        return this.type.isObjectType ? this.type.fields.find(field => field.inverseOf === this) : undefined;
    }

    constructor(private readonly input: FieldInput & { isSystemField?: boolean }, public readonly declaringType: ObjectType) {
        this.model = declaringType.model;
        this.name = input.name;
        this.description = input.description;
        this.astNode = input.astNode;
        this.defaultValue = input.defaultValue;
        this.isReference = input.isReference || false;
        this.isRelation = input.isRelation || false;
        this.isList = input.isList || false;
        this.calcMutationOperators = new Set(input.calcMutationOperators || []);
        this.roles = input.permissions && input.permissions.roles ? {
            read: input.permissions.roles.read || [],
            readWrite: input.permissions.roles.readWrite || [],
        } : undefined;
        this.isSystemField = input.isSystemField || false;
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
        this.validateDefaultValue(context);
        this.validateCalcMutations(context);
    }

    private validateName(context: ValidationContext) {
        if (!this.name) {
            context.addMessage(ValidationMessage.error(`Field name is empty.`, undefined, this.astNode));
            return;
        }

        // Especially forbid leading underscores. This is more of a linter rule, but it also ensures there are no collisions with e.g. ArangoDB's predefined fields like _key.
        if (!this.name.match(/^[a-zA-Z][a-zA-Z0-9]+$/)) {
            context.addMessage(ValidationMessage.error(`Field names should only contain alphanumeric characters.`, undefined, this.astNode));
            return;
        }

        // this is a linter rule
        if (!this.name.match(/^[a-z]/)) {
            context.addMessage(ValidationMessage.warn(`Field names should start with a lowercase character.`, undefined, this.astNode));
        }
    }

    private validateType(context: ValidationContext) {
        if (!this.model.getType(this.input.typeName)) {
            context.addMessage(ValidationMessage.error(`Type "${this.input.typeName}" not found.`, undefined, this.input.typeNameAST || this.astNode));
        }
    }

    private validateRootEntityType(context: ValidationContext) {
        // this does not fit anywhere else properly
        if (this.isReference && this.isRelation) {
            context.addMessage(ValidationMessage.error(`@reference and @relation can not be combined.`, undefined, this.astNode));
        }

        if (this.type.kind !== TypeKind.ROOT_ENTITY) {
            return;
        }

        // root entities are not embeddable
        if (!this.isRelation && !this.isReference) {
            if (this.declaringType.kind == TypeKind.ROOT_ENTITY) {
                context.addMessage(ValidationMessage.error(`Type "${this.type.name}" is a root entity type and can not be embedded. Consider adding @reference.`, undefined, this.astNode));
            } else {
                context.addMessage(ValidationMessage.error(`Type "${this.type.name}" is a root entity type and can not be embedded. Consider adding @reference or @relation.`, undefined, this.astNode));
            }
        }
    }

    private validateRelation(context: ValidationContext) {
        if (!this.isRelation) {
            return;
        }

        if (this.declaringType.kind !== TypeKind.ROOT_ENTITY) {
            context.addMessage(ValidationMessage.error(`Relations can only be defined on root entity types. Consider using @reference instead.`, undefined, this.astNode));
        }

        // do target type validations only if it resolved correctly
        if (!this.hasValidType) {
            return;
        }

        if (this.type.kind !== TypeKind.ROOT_ENTITY) {
            context.addMessage(ValidationMessage.error(`Type "${this.type.name}" can not be used with @relation because it is not a root entity type`, undefined, this.astNode));
            return;
        }

        if (this.input.inverseOfFieldName != undefined) {
            const inverseOf = this.type.getField(this.input.inverseOfFieldName);
            const inverseFieldDesc = `Field "${this.type.name}.${this.input.inverseOfFieldName}" used as inverse field of "${this.declaringType.name}.${this.name}"`;
            if (!inverseOf) {
                context.addMessage(ValidationMessage.error(`Field "${this.input.inverseOfFieldName}" does not exist on type "${this.type.name}".`, undefined, this.input.inverseOfASTNode || this.astNode));
            } else if (inverseOf.type && inverseOf.type !== this.declaringType) {
                context.addMessage(ValidationMessage.error(`${inverseFieldDesc} has named type "${inverseOf.type.name}" but should be of type "${this.declaringType.name}".`, undefined, this.input.inverseOfASTNode || this.astNode));
            } else if (!inverseOf.isRelation) {
                context.addMessage(ValidationMessage.error(`${inverseFieldDesc} does not have the @relation directive.`, undefined, this.input.inverseOfASTNode || this.astNode));
            } else if (inverseOf.inverseOf != undefined) {
                context.addMessage(ValidationMessage.error(`${inverseFieldDesc} should not declare inverseOf itself.`, undefined, this.input.inverseOfASTNode || this.astNode));
            }
        } else {
            // look for @relation(inverseOf: "thisField") in the target type
            const inverseFields = this.type.fields.filter(field => field.inverseOf === this);
            if (inverseFields.length === 0) {
                // no @relation(inverseOf: "thisField") - should be ok, but is suspicious if there is a matching @relation back to this type
                const matchingRelation = this.type.fields.find(field => field.isRelation && field.type === this.declaringType && field.inverseOf == undefined);
                if (matchingRelation) {
                    context.addMessage(ValidationMessage.warn(`This field and "${matchingRelation.declaringType.name}.${matchingRelation.name}" define separate relations. Consider using the "inverseOf" argument to add a backlink to an existing relation.`, undefined, this.astNode));
                }
            } else if (inverseFields.length > 1) {
                const names = inverseFields.map(f => `"${this.type.name}.${f.name}"`).join(', ');
                // found multiple inverse fields - this is an error
                // check this here and not in the inverse fields so we don't report stuff twice
                for (const inverseField of inverseFields) {
                    context.addMessage(ValidationMessage.error(`Multiple fields (${names}) declare inverseOf to "${this.declaringType.name}.${this.name}".`, undefined, inverseField.astNode));
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
            context.addMessage(ValidationMessage.error(`"${this.type.name}" can not be used as @reference type because is not a root entity type.`, undefined, this.astNode));
            return;
        }

        if (this.isList) {
            context.addMessage(ValidationMessage.error(`@reference is not supported with list types. Consider wrapping the reference in a child entity or value object type.`, undefined, this.astNode));
        }

        if (!this.type.keyField) {
            context.addMessage(ValidationMessage.error(`"${this.type.name}" can not be used as @reference type because is does not have a field annotated with @key.`, undefined, this.astNode));
        }
    }

    private validateEntityExtensionType(context: ValidationContext) {
        if (this.type.kind !== TypeKind.ENTITY_EXTENSION) {
            return;
        }

        if (this.declaringType.kind === TypeKind.VALUE_OBJECT) {
            context.addMessage(ValidationMessage.error(`Type "${this.type.name}" is an entity extension and can not be used within value object types. Change "${this.declaringType.name}" to an entity extension type or use a value object type for "${this.name}".`));
        }

        if (this.isList) {
            context.addMessage(ValidationMessage.error(`Type "${this.type.name}" can not be used in a list because it is an entity extension type. Use a child entity or value object type, or change the field type to "${this.type.name}".`));
        }
    }

    private validateChildEntityType(context: ValidationContext) {
        if (this.type.kind !== TypeKind.CHILD_ENTITY) {
            return;
        }

        if (this.declaringType.kind === TypeKind.VALUE_OBJECT) {
            context.addMessage(ValidationMessage.error(`Type "${this.type.name}" is an entity extension and can not be used within value object types. Change "${this.declaringType.name}" to an entity extension type or use a value object type for "${this.name}".`));
        }

        if (!this.isList) {
            context.addMessage(ValidationMessage.error(`Type "${this.type.name}" can only be used in a list because it is a child entity type. Use an entity extension or value object type, or change the field type to "[${this.type.name}]".`))
        }
    }

    private validatePermissions(context: ValidationContext) {
        const permissions = this.input.permissions;
        if (permissions != undefined) {
            if (permissions.permissionProfileName != undefined && permissions.roles != undefined) {
                const message = `Permission profile and explicit role specifiers can not be combined`;
                context.addMessage(ValidationMessage.error(message, undefined, permissions.permissionProfileNameAstNode || this.input.astNode ));
                context.addMessage(ValidationMessage.error(message, undefined, permissions.rolesASTNode || this.input.astNode ));
            }

            if (permissions.permissionProfileName != undefined && !this.model.getPermissionProfile(permissions.permissionProfileName)) {
                context.addMessage(ValidationMessage.error(`Permission profile "${permissions.permissionProfileName}" not found`, undefined, permissions.permissionProfileNameAstNode || this.input.astNode ));
            }
        }
    }

    private validateDefaultValue(context: ValidationContext) {
        if (this.defaultValue == undefined) {
            return;
        }

        if (this.type.kind !== TypeKind.SCALAR && this.type.kind !== TypeKind.ENUM) {
            context.addMessage(ValidationMessage.error(`Default values are only supported on scalar and enum fields.`, undefined, this.input.defaultValueASTNode || this.astNode));
            return;
        }

        context.addMessage(ValidationMessage.info(`Take care, there are no type checks for default values yet.`, undefined, this.input.defaultValueASTNode || this.astNode));
    }

    private validateCalcMutations(context: ValidationContext) {
        if (!this.calcMutationOperators.size) {
            return;
        }

        if (this.isList) {
            context.addMessage(ValidationMessage.error(`Calc mutations are not supported on list fields.`, undefined, this.astNode));
            return;
        }

        for (const operator of this.calcMutationOperators) {
            const desc = CALC_MUTATIONS_OPERATORS.find(op => op.name == operator);
            if (!desc) {
                throw new Error(`Unknown calc mutation operator: ${operator}`);
            }
            const supportedTypesDesc = desc.supportedTypes.map(t => `"${t}"`).join(", ");
            if (!(desc.supportedTypes.includes(this.type.name))) {
                context.addMessage(ValidationMessage.error(`Calc mutation operator "${operator}" is not supported on type "${this.type.name}" (supported types: ${supportedTypesDesc}).`, undefined, this.astNode));
            }
        }
    }
}
