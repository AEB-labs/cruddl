import { EnumValueDefinitionNode } from 'graphql';
import { EnumTypeConfig, EnumValueConfig, TypeKind } from '../config';
import { EnumValueLocalization } from './i18n';
import { Model } from './model';
import { TypeBase } from './type-base';

export class EnumType extends TypeBase {
    constructor(input: EnumTypeConfig, model: Model) {
        super(input, model);
        this.values = input.values.map(v => new EnumValue(v, this));
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
    readonly deprecationReason: string | undefined;
    readonly astNode: EnumValueDefinitionNode | undefined;

    constructor(input: EnumValueConfig, public readonly declaringType: EnumType) {
        this.value = input.value;
        this.description = input.description;
        this.deprecationReason = input.deprecationReason;
        this.astNode = input.astNode;
    }

    public getLocalization(resolutionOrder: ReadonlyArray<string>): EnumValueLocalization {
        return this.declaringType.model.i18n.getEnumValueLocalization(this, resolutionOrder);
    }
}
