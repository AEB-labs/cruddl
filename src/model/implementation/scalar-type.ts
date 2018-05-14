import { TypeBase } from './type-base';
import { ScalarTypeInput, TypeKind } from '../input';
import { Model } from './model';

export class ScalarType extends TypeBase {
    constructor(input: Exclude<ScalarTypeInput, 'typeKind'>) {
        super(input);
    }

    isObjectType: false = false;
    kind: TypeKind.SCALAR = TypeKind.SCALAR;
}
