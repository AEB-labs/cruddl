import { GraphQLBoolean, GraphQLID, GraphQLInt, GraphQLString } from 'graphql';
import memorize from 'memorize-decorator';
import { GraphQLInt53 } from '../../schema/scalars/int53';
import { BillingEntityCategoryMappingConfig, BillingEntityConfig } from '../config/billing';
import { ValidationMessage } from '../validation';
import { ModelComponent, ValidationContext } from '../validation/validation-context';
import { Field } from './field';
import { FieldPath } from './field-path';
import { Model } from './model';
import { RootEntityType } from './root-entity-type';

export class BillingEntityType implements ModelComponent {
    readonly quantityFieldPath: FieldPath | undefined;
    readonly categoryMappingFieldPath: FieldPath | undefined;

    constructor(readonly input: BillingEntityConfig, readonly model: Model) {
        if (this.rootEntityType) {
            if (input.quantityFieldName) {
                this.quantityFieldPath = new FieldPath({
                    path: input.quantityFieldName,
                    location: input.quantityFieldNameLoc,
                    baseType: this.rootEntityType
                });
            }
            if (input.categoryMapping && input.categoryMapping.fieldName) {
                this.categoryMappingFieldPath = new FieldPath({
                    path: input.categoryMapping.fieldName,
                    location: input.categoryMapping.fieldNameLoc,
                    baseType: this.rootEntityType
                });
            }
        }
    }

    validate(context: ValidationContext): void {
        if (!this.rootEntityType) {
            context.addMessage(
                ValidationMessage.error(
                    `No rootEntity with the name "${this.input.typeName}" is defined.`,
                    this.input.typeNameLoc
                )
            );
            return;
        }
        if (this.input.keyFieldName && !this.rootEntityType.getField(this.input.keyFieldName)) {
            context.addMessage(
                ValidationMessage.error(
                    `The field "${this.input.keyFieldName}" is not defined in the type "${this.input.typeName}".`,
                    this.input.keyFieldNameLoc
                )
            );
            return;
        }
        if (!this.input.keyFieldName && !this.rootEntityType.keyField) {
            context.addMessage(
                ValidationMessage.error(
                    `The type "${this.input.typeName}" does not define a keyField and no "keyFieldName" is defined.`,
                    this.input.keyFieldNameLoc
                )
            );
            return;
        }
        if (
            !this.billingKeyField!.type.isScalarType ||
            !(
                this.billingKeyField!.type.name === 'String' ||
                this.billingKeyField!.type.name === 'Int' ||
                this.billingKeyField!.type.name === 'ID'
            )
        ) {
            context.addMessage(
                ValidationMessage.error(
                    `The field "${this.input.keyFieldName}" in the type "${this.input.typeName}" is not a "String", "Int", or "ID".`,
                    this.input.keyFieldNameLoc
                )
            );
            return;
        }
        if (this.model.billingEntityTypes.find(value => value.typeName === this.typeName && value !== this)) {
            context.addMessage(
                ValidationMessage.error(
                    `There are multiple billing configurations for the type "${this.typeName}".`,
                    this.input.typeNameLoc
                )
            );
            return;
        }

        this.validateQuantityField(context);
        this.validateCategory(context);
    }

    private validateQuantityField(context: ValidationContext) {
        if (!this.rootEntityType || !this.quantityFieldPath) {
            return;
        }
        this.quantityFieldPath.validate(context);

        if (this.quantityFieldPath.isList) {
            // lists are ok - we use the count
            return;
        }
        const lastField = this.quantityFieldPath.lastField;
        if (!lastField) {
            // validation failed anyway
            return;
        }

        if (!lastField.type.isScalarType || !lastField.type.isNumberType) {
            context.addMessage(
                ValidationMessage.error(
                    `The quantity field must be of a number or a list type, but "${lastField.type.name}.${lastField.name}" is of type "${lastField.type.name}".`,
                    this.input.quantityFieldNameLoc
                )
            );
        }
    }

    private validateCategory(context: ValidationContext) {
        if (!this.rootEntityType) {
            return;
        }

        if (this.input.category != undefined) {
            if (this.input.categoryMapping != undefined) {
                context.addMessage(
                    ValidationMessage.error(
                        `"category" and "categoryMapping" cannot be combined.`,
                        this.input.categoryMappingLoc
                    )
                );
                context.addMessage(
                    ValidationMessage.error(
                        `"category" and "categoryMapping" cannot be combined.`,
                        this.input.categoryLoc
                    )
                );
            }
            return;
        }

        if (this.input.categoryMapping == undefined || !this.categoryMappingFieldPath) {
            return;
        }

        this.categoryMappingFieldPath.validate(context);
        const lastField = this.categoryMappingFieldPath.lastField;
        if (!lastField) {
            // validation failed anyway
            return;
        }

        if (lastField.isList) {
            context.addMessage(
                ValidationMessage.error(
                    `Field "${lastField.type.name}.${lastField.name}" is a list and cannot be used as mapping source.`,
                    this.input.categoryMapping.fieldNameLoc
                )
            );
        }

        const allowedTypes = [GraphQLString, GraphQLID, GraphQLBoolean, GraphQLInt, GraphQLInt53];
        if (!allowedTypes.some(t => t.name === lastField.type.name) && !lastField.type.isEnumType) {
            context.addMessage(
                ValidationMessage.error(
                    `Only fields of type ${allowedTypes
                        .map(t => t.name)
                        .join(', ')} and of enum types can be used as mapping source, but "${
                        this.rootEntityType.name
                    }.${this.input.categoryMapping.fieldName}" is of type "${lastField.type.name}".`,
                    this.input.categoryMapping.fieldNameLoc
                )
            );
        }

        // TODO maybe type checking of mapping keys?
    }

    @memorize()
    get rootEntityType(): RootEntityType | undefined {
        return this.model.rootEntityTypes.find(value => value.name === this.input.typeName);
    }

    @memorize()
    get billingKeyField(): Field | undefined {
        if (!this.rootEntityType) {
            return undefined;
        }
        if (this.input.keyFieldName) {
            return this.rootEntityType.fields.find(value => value.name === this.input.keyFieldName);
        } else {
            return this.rootEntityType.keyField;
        }
    }

    get typeName() {
        return this.input.typeName;
    }

    @memorize()
    get keyFieldName() {
        return (
            this.input.keyFieldName ||
            (this.rootEntityType && this.rootEntityType.keyField ? this.rootEntityType.keyField.name : undefined)
        );
    }

    get category(): string | undefined {
        return this.input.category;
    }

    get categoryMapping(): BillingEntityCategoryMappingConfig | undefined {
        return this.input.categoryMapping;
    }
}
