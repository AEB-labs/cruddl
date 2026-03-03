import { TypeKind, ValueObjectTypeConfig } from '../config';
import { Model } from './model';
import { ObjectTypeBase } from './object-type-base';

export class ValueObjectType extends ObjectTypeBase {
    constructor(input: ValueObjectTypeConfig, model: Model) {
        super(input, model);
    }

    readonly kind: TypeKind.VALUE_OBJECT = TypeKind.VALUE_OBJECT;
    readonly isChildEntityType: false = false;
    readonly isRootEntityType: false = false;
    readonly isEntityExtensionType: false = false;
    readonly isValueObjectType: true = true;
}
