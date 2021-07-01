import { GraphQLScalarType } from 'graphql';
import { Model } from './model';
import { TypeBase } from './type-base';
import { ScalarTypeConfig, TypeKind } from '../config';

export class ScalarType extends TypeBase {
    constructor(input: ScalarTypeConfig, model: Model) {
        super(input, model);
        this.graphQLScalarType = input.graphQLScalarType;
        this.isNumberType = input.isNumberType ?? false;
        this.fixedPointDecimalInfo = input.fixedPointDecimalInfo;
    }

    readonly isObjectType: false = false;
    readonly kind: TypeKind.SCALAR = TypeKind.SCALAR;
    readonly isChildEntityType: false = false;
    readonly isRootEntityType: false = false;
    readonly isEntityExtensionType: false = false;
    readonly isValueObjectType: false = false;
    readonly isScalarType: true = true;
    readonly isEnumType: false = false;
    readonly graphQLScalarType: GraphQLScalarType;

    /**
     * Specifies whether this type is considered compatible with the javascript number type
     */
    readonly isNumberType: boolean;

    readonly fixedPointDecimalInfo?: FixedPointDecimalInfo;
}

export interface FixedPointDecimalInfo {
    readonly digits: number;
}
