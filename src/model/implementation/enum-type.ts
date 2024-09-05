import { EnumValueDefinitionNode } from 'graphql';
import { EnumTypeConfig, EnumValueConfig, TypeKind } from '../config';
import { ValidationContext, ValidationMessage } from '../validation';
import { ModelComponent } from '../validation/validation-context';
import { EnumValueLocalization } from './i18n';
import { Model } from './model';
import { TypeBase } from './type-base';
import memorize from 'memorize-decorator';
import { WarningCode } from '../../schema/message-codes';

export class EnumType extends TypeBase {
    constructor(input: EnumTypeConfig, model: Model) {
        super(input, model);
        this.values = input.values.map((v) => new EnumValue(v, this));
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

    validate(context: ValidationContext) {
        super.validate(context);
        for (const value of this.values) {
            value.validate(context);
        }
    }
}

export class EnumValue implements ModelComponent {
    readonly value: string;
    readonly description: string | undefined;
    readonly deprecationReason: string | undefined;
    readonly astNode: EnumValueDefinitionNode | undefined;
    readonly model: Model;

    constructor(
        input: EnumValueConfig,
        public readonly declaringType: EnumType,
    ) {
        this.value = input.value;
        this.description = input.description;
        this.deprecationReason = input.deprecationReason;
        this.astNode = input.astNode;
        this.model = declaringType.model;
    }

    public getLocalization(resolutionOrder: ReadonlyArray<string>): EnumValueLocalization {
        return this.declaringType.model.i18n.getEnumValueLocalization(this, resolutionOrder);
    }

    validate(context: ValidationContext) {
        if (this.value === 'true' || this.value === 'false' || this.value === 'null') {
            // this is a graphql restriction, but the validator has only been introduced in
            // graphql-js version 16. Can be removed once we drop support for graphql 15.
            // see https://github.com/graphql/graphql-js/pull/3223
            context.addMessage(
                ValidationMessage.error(`Enums cannot define value "${this.value}".`, this.astNode),
            );
            return;
        }
        if (this.value.toUpperCase() !== this.value) {
            context.addMessage(
                ValidationMessage.suppressableWarning(
                    'NAMING',
                    `Enum values should be UPPER_CASE.`,
                    this.astNode,
                ),
            );
        }
    }

    @memorize()
    get label(): Record<string, string> {
        const res: Record<string, string> = {};
        for (const [lang, localization] of Object.entries(this.model.i18n.getEnumValueI18n(this))) {
            if (localization.label) {
                res[lang] = localization.label;
            }
        }
        return res;
    }

    @memorize()
    get hint(): Record<string, string> {
        const res: Record<string, string> = {};
        for (const [lang, localization] of Object.entries(this.model.i18n.getEnumValueI18n(this))) {
            if (localization.hint) {
                res[lang] = localization.hint;
            }
        }
        return res;
    }
}
