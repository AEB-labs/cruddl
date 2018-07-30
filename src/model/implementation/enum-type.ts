import { EnumValueDefinitionNode } from 'graphql';
import { EnumTypeConfig, EnumValueConfig, TypeKind } from '../config';
import { Model } from './model';
import { TypeBase } from './type-base';

export class EnumType extends TypeBase {
    constructor(input: EnumTypeConfig, model: Model) {
        super(input, model);
        this.values = input.values.map(v => new EnumValue(v));
    }

    readonly values: ReadonlyArray<EnumValue>;

    readonly isObjectType: false = false;
    readonly kind: TypeKind.ENUM = TypeKind.ENUM;
    readonly isChildEntityType: false = false;
    readonly isRootEntityType: false = false;
    readonly isEntityExtensionType: false = false;
    readonly isValueObjectType: false = false;
    readonly isScalarType: false = false;
    readonly isEnumType: true = true;
}

export class EnumValue {
    readonly value: string;
    readonly description: string | undefined;
    readonly astNode: EnumValueDefinitionNode | undefined;

    constructor(input: EnumValueConfig) {
        this.value = input.value;
        this.description = input.description;
        this.astNode = input.astNode;
    }
}
