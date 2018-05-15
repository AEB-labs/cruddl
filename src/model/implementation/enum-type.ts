import { TypeBase } from './type-base';
import { EnumTypeInput, TypeKind } from '../input';

export class EnumType extends TypeBase {
    constructor(input: EnumTypeInput) {
        super(input);
    }

    readonly isObjectType: false = false;
    readonly kind: TypeKind.ENUM = TypeKind.ENUM;
}
