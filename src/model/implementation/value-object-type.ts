import { ObjectTypeBase } from './object-type-base';
import { ScalarTypeInput, TypeKind, ValueObjectTypeInput } from '../input';
import { Model } from './model';

export class ValueObjectType extends ObjectTypeBase {
    constructor(input: Exclude<ValueObjectTypeInput, 'typeKind'>, model: Model) {
        super(input, model);
    }

    readonly kind: TypeKind.VALUE_OBJECT = TypeKind.VALUE_OBJECT;
    readonly isChildEntityType: false = false;
    readonly isRootEntityType: false = false;
    readonly isEntityExtensionType: false = false;
    readonly isValueObjectType: true = true;
}
