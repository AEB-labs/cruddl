import { TypeBase } from './type-base';
import { ScalarTypeInput, TypeKind } from '../input';

export class ScalarType extends TypeBase {
    constructor(input: Exclude<ScalarTypeInput, 'typeKind'>) {
        super(input);
    }

    readonly isObjectType: false = false;
    readonly kind: TypeKind.SCALAR = TypeKind.SCALAR;
}
