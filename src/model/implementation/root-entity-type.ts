import { RootEntityTypeInput, TypeKind } from '../input';
import { ObjectTypeBase } from './object-type-base';
import { Field } from './field';
import { Model } from './model';

export class RootEntityType extends ObjectTypeBase {
    readonly keyField: Field|undefined;
    readonly namespacePath: string[];

    constructor(input: RootEntityTypeInput, model: Model) {
        super(input, model);
        this.keyField = input.keyFieldName != undefined ? this.getField(input.keyFieldName) : undefined;
        this.namespacePath = input.namespacePath || [];
    }

    readonly kind: TypeKind.ROOT_ENTITY = TypeKind.ROOT_ENTITY;
}
