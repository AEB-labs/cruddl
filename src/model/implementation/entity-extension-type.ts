import { EntityExtensionTypeConfig, TypeKind } from '../config/index.js';
import { ValidationContext, ValidationMessage } from '../validation/index.js';
import { Field } from './field.js';
import { Model } from './model.js';
import { ObjectTypeBase } from './object-type-base.js';

export class EntityExtensionType extends ObjectTypeBase {
    constructor(input: EntityExtensionTypeConfig, model: Model) {
        super(input, model);
    }

    readonly kind: TypeKind.ENTITY_EXTENSION = TypeKind.ENTITY_EXTENSION;
    readonly isChildEntityType: false = false;
    readonly isRootEntityType: false = false;
    readonly isEntityExtensionType: true = true;
    readonly isValueObjectType: false = false;

    validate(context: ValidationContext) {
        super.validate(context);

        this.validateRecursion(context);
    }

    private validateRecursion(context: ValidationContext) {
        const thisType = this;

        function fieldContainsRecursion(field: Field): boolean {
            if (field.type.name === thisType.name && field.type.namespace === thisType.namespace) {
                return true;
            } else if (field.type.isEntityExtensionType) {
                return field.type.fields.some((value) => fieldContainsRecursion(value));
            } else {
                return false;
            }
        }

        const recursiveFields = this.fields.filter(fieldContainsRecursion);

        recursiveFields.forEach((value) => {
            context.addMessage(
                ValidationMessage.error(
                    `EntityTypes cannot recursively contain an EntityType of their own type.`,
                    value.astNode,
                ),
            );
        });
    }
}
