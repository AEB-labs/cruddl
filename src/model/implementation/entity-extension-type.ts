import { ObjectTypeBase } from './object-type-base';
import { EntityExtensionTypeInput, TypeKind } from '../input';
import { Model } from './model';

export class EntityExtensionType extends ObjectTypeBase {
    constructor(input: EntityExtensionTypeInput, model: Model) {
        super(input, model);
    }

    readonly kind: TypeKind.ENTITY_EXTENSION = TypeKind.ENTITY_EXTENSION;
}
