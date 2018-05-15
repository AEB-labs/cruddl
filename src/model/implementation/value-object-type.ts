import { ObjectTypeBase } from './object-type-base';
import { ScalarTypeInput, TypeKind, ValueObjectTypeInput } from '../input';
import { Model } from './model';

export class ValueObjectType extends ObjectTypeBase {
    constructor(input: Exclude<ValueObjectTypeInput, 'typeKind'>, model: Model) {
        super(input, model);
    }

    readonly kind: TypeKind.VALUE_OBJECT = TypeKind.VALUE_OBJECT;
}
