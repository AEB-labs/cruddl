import { GraphQLInputType, GraphQLList, GraphQLNonNull } from 'graphql';
import { Field } from '../../model/implementation';
import { AnyValue, PlainObject } from '../../utils/utils';
import { TypedInputFieldBase } from '../typed-input-object-type';
import { CreateObjectInputType } from './input-types';

export interface CreateInputField extends TypedInputFieldBase<CreateInputField> {
    getProperties(value: AnyValue): PlainObject;

    collectAffectedFields(value: AnyValue, fields: Set<Field>): void;

    appliesToMissingFields(): boolean;
}

export class BasicCreateInputField implements CreateInputField {
    constructor(
        public readonly field: Field,
        public readonly inputType: GraphQLInputType | CreateObjectInputType
    ) {
    }

    get name() {
        return this.field.name;
    }

    getProperties(value: AnyValue) {
        if (value === undefined && this.field.hasDefaultValue) {
            value = this.field.defaultValue;
        }

        value = this.coerceValue(value);

        return {
            [this.field.name]: value
        };
    }

    protected coerceValue(value: AnyValue): AnyValue {
        return value;
    }

    collectAffectedFields(value: AnyValue, fields: Set<Field>) {
        if (value === undefined) {
            // don't consider this field if it is just set to its default value
            // this enables permission-restricted fields with a non-critical default value
            return;
        }

        fields.add(this.field);
    }

    appliesToMissingFields() {
        return this.field.hasDefaultValue;
    }
}

export class BasicListCreateInputField extends BasicCreateInputField {
    protected coerceValue(value: AnyValue): AnyValue {
        value = super.coerceValue(value);
        if (value === null) {
            // null is not a valid list value - if the user specified it, coerce it to [] to not have a mix of [] and
            // null in the database
            return [];
        }
        return value;
    }
}

export class ObjectCreateInputField extends BasicCreateInputField {
    constructor(
        field: Field,
        public readonly objectInputType: CreateObjectInputType,
        inputType?: GraphQLInputType
    ) {
        super(field, inputType || objectInputType.getInputType());
    }

    protected coerceValue(value: AnyValue): AnyValue {
        value = super.coerceValue(value);
        if (value == undefined) {
            return value;
        }
        return this.objectInputType.prepareValue(value);
    }

    collectAffectedFields(value: AnyValue, fields: Set<Field>) {
        super.collectAffectedFields(value, fields);
        if (value == undefined) {
            return;
        }

        this.objectInputType.collectAffectedFields(value, fields);
    }
}

export class ObjectListCreateInputField extends BasicCreateInputField {
    constructor(
        field: Field,
        public readonly objectInputType: CreateObjectInputType
    ) {
        super(field, new GraphQLList(new GraphQLNonNull(objectInputType.getInputType())));
    }

    protected coerceValue(value: AnyValue): AnyValue {
        value = super.coerceValue(value);
        if (value === null) {
            // null is not a valid list value - if the user specified it, coerce it to [] to not have a mix of [] and
            // null in the database
            return [];
        }
        if (value === undefined) {
            return undefined;
        }
        if (!Array.isArray(value)) {
            throw new Error(`Expected value for "${this.name}" to be an array, but is "${typeof value}"`);
        }
        return value.map(value => this.objectInputType.prepareValue(value));
    }

    collectAffectedFields(value: AnyValue, fields: Set<Field>) {
        super.collectAffectedFields(value, fields);
        if (value == undefined) {
            return;
        }
        if (!Array.isArray(value)) {
            throw new Error(`Expected value for "${this.name}" to be an array, but is "${typeof value}"`);
        }

        value.forEach(value => this.objectInputType.collectAffectedFields(value, fields));
    }
}
