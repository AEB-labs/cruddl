import { RootEntityTypeInput, TypeKind } from '../input';
import { ObjectTypeBase } from './object-type-base';
import { Field } from './field';
import { Model } from './model';
import { ValidationContext } from './validation';
import { ValidationMessage } from '../validation';
import { Index } from './indices';

export class RootEntityType extends ObjectTypeBase {
    readonly keyField: Field|undefined;
    readonly namespacePath: ReadonlyArray<string>;
    readonly indices: ReadonlyArray<Index>;

    constructor(private input: RootEntityTypeInput, model: Model) {
        super(input, model);
        this.keyField = input.keyFieldName != undefined ? this.getField(input.keyFieldName) : undefined;
        this.namespacePath = input.namespacePath || [];
        this.indices = (input.indices || []).map(index => new Index(index, this));
    }

    readonly kind: TypeKind.ROOT_ENTITY = TypeKind.ROOT_ENTITY;

    validate(context: ValidationContext) {
        super.validate(context);

        this.validateKeyField(context);
        for (const index of this.indices) {
            index.validate(context);
        }
    }

    private validateKeyField(context: ValidationContext) {
        if (this.input.keyFieldName == undefined) {
            return;
        }

        const field = this.getField(this.input.keyFieldName);

        if (!field) {
            context.addMessage(ValidationMessage.error(`Key field "${this.input.keyFieldName}" does not exist on type "${this.name}"`, undefined, this.astNode));
            return;
        }

        if (field.type.kind !== TypeKind.SCALAR) {
            context.addMessage(ValidationMessage.error(`Only fields of scalar type can be used as key field`, undefined, field.astNode || this.astNode));
        }

        if (field.isList) {
            context.addMessage(ValidationMessage.error(`List fields can not be used as key field`, undefined, field.astNode || this.astNode));
        }
    }
}
