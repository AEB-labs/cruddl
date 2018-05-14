import { TypeBase } from './type-base';
import { EnumTypeInput, TypeKind } from '../input';

export class EnumType extends TypeBase {
    constructor(input: EnumTypeInput) {
        super(input);
    }

    isObjectType: false = false;
    kind: TypeKind.ENUM = TypeKind.ENUM;
}
