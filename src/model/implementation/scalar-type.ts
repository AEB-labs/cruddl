import { GraphQLScalarType } from 'graphql';
import { Model } from './model';
import { TypeBase } from './type-base';
import { ScalarTypeConfig, TypeKind } from '../config';

export class ScalarType extends TypeBase {
    constructor(input: ScalarTypeConfig, model: Model, public readonly graphQLScalarType: GraphQLScalarType) {
        super(input, model);
    }

    readonly isObjectType: false = false;
    readonly kind: TypeKind.SCALAR = TypeKind.SCALAR;
    readonly isChildEntityType: false = false;
    readonly isRootEntityType: false = false;
    readonly isEntityExtensionType: false = false;
    readonly isValueObjectType: false = false;
    readonly isScalarType: true = true;
    readonly isEnumType: false = false;
}
