import { ObjectTypeBase } from './object-type-base';
import { ChildEntityTypeInput, TypeKind } from '../input';
import { Model } from './model';

export class ChildEntityType extends ObjectTypeBase {
    constructor(input: ChildEntityTypeInput, model: Model) {
        super(input, model);
    }

    readonly kind: TypeKind.CHILD_ENTITY = TypeKind.CHILD_ENTITY;
}
