import { ObjectTypeBase } from './object-type-base';
import { ScalarTypeConfig, TypeKind, ValueObjectTypeConfig } from '../config';
import { Model } from './model';

export class ValueObjectType extends ObjectTypeBase {
    constructor(input: Exclude<ValueObjectTypeConfig, 'typeKind'>, model: Model) {
        super(input, model);
    }

    readonly kind: TypeKind.VALUE_OBJECT = TypeKind.VALUE_OBJECT;
    readonly isChildEntityType: false = false;
    readonly isRootEntityType: false = false;
    readonly isEntityExtensionType: false = false;
    readonly isValueObjectType: true = true;
}
