import { ObjectTypeBase } from './object-type-base';
import { EntityExtensionTypeConfig, TypeKind } from '../input';
import { Model } from './model';

export class EntityExtensionType extends ObjectTypeBase {
    constructor(input: EntityExtensionTypeConfig, model: Model) {
        super(input, model);
    }

    readonly kind: TypeKind.ENTITY_EXTENSION = TypeKind.ENTITY_EXTENSION;
    readonly isChildEntityType: false = false;
    readonly isRootEntityType: false = false;
    readonly isEntityExtensionType: true = true;
    readonly isValueObjectType: false = false;
}
