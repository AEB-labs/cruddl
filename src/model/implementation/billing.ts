import memorize from 'memorize-decorator';
import { ValidationMessage } from '../validation';
import { BillingConfig, BillingEntityConfig } from '../config/billing';
import { ModelComponent, ValidationContext } from '../validation/validation-context';
import { Field } from './field';
import { Model } from './model';
import { RootEntityType } from './root-entity-type';

export class BillingEntityType implements ModelComponent {
    constructor(readonly input: BillingEntityConfig, readonly model: Model) {}

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
        if (
            this.input.keyFieldName &&
            !this.rootEntityType.fields.find(value => value.name === this.input.keyFieldName)
        ) {
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
                    `The field "${this.input.keyFieldName}" in the type "${this.input.typeName}" is not a "String", "Int" or "ID".`,
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
}
