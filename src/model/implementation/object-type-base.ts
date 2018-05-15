import { ObjectTypeInput } from '../input';
import { TypeBase } from './type-base';
import { Field } from './field';
import { ObjectType } from './type';
import { Model } from './model';
import { ValidationContext } from './validation';
import { ValidationMessage } from '../validation';

export abstract class ObjectTypeBase extends TypeBase {
    readonly fields: ReadonlyArray<Field>;
    private readonly fieldMap: ReadonlyMap<string, Field>;

    protected constructor(input: ObjectTypeInput, protected readonly model: Model) {
        super(input);
        this.fields = (input.fields || []).map(field => new Field(field, this as any as ObjectType, model));
        this.fieldMap = new Map(this.fields.map((field): [string, Field] => [ field.name, field ]));
    }

    validate(context: ValidationContext) {
        super.validate(context);

        if (!this.fields.length) {
            context.addMessage(ValidationMessage.error(`Object type "${this.name}" does not declare any fields.`, undefined, this.astNode));
        }

        for (const field of this.fields) {
            field.validate(context);
        }
    }

    getField(name: string): Field|undefined {
        return this.fieldMap.get(name);
    }

    getFieldOrThrow(name: string): Field {
        const field = this.getField(name);
        if (field == undefined) {
            throw new Error(`Field "${this.name}.${name}" is not declared`);
        }
        return field;
    }

    readonly isObjectType: true = true;
}
