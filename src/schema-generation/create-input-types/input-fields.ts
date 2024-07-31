import { GraphQLInputType, GraphQLList, GraphQLNonNull } from 'graphql';
import { ZonedDateTime } from '@js-joda/core';
import { Field } from '../../model';
import { GraphQLOffsetDateTime, serializeForStorage } from '../../schema/scalars/offset-date-time';
import { AnyValue, isReadonlyArray, PlainObject } from '../../utils/utils';
import { createGraphQLError } from '../graphql-errors';
import { FieldContext } from '../query-node-object-type';
import { TypedInputFieldBase, TypedInputObjectType } from '../typed-input-object-type';
import { CreateObjectInputType } from './input-types';

export interface FieldValidationContext extends FieldContext {
    readonly objectValue: PlainObject;
}

export interface CreateInputField extends TypedInputFieldBase<CreateInputField> {
    getProperties(value: AnyValue, context: FieldContext): PlainObject;

    collectAffectedFields(value: AnyValue, fields: Set<Field>, context: FieldContext): void;

    appliesToMissingFields(): boolean;

    validateInContext(value: AnyValue, context: FieldValidationContext): void;
}

export class DummyCreateInputField implements CreateInputField {
    readonly deprecationReason: string | undefined;

    constructor(
        readonly name: string,
        readonly inputType: GraphQLInputType | TypedInputObjectType<CreateInputField>,
        opts: {
            readonly deprecationReason?: string;
        } = {},
    ) {
        this.deprecationReason = opts.deprecationReason;
    }

    appliesToMissingFields(): boolean {
        return false;
    }

    collectAffectedFields(value: AnyValue, fields: Set<Field>, context: FieldContext): void {}

    getProperties(value: AnyValue, context: FieldContext): PlainObject {
        return {};
    }

    validateInContext(value: AnyValue, context: FieldValidationContext): void {}
}

export class BasicCreateInputField implements CreateInputField {
    constructor(
        public readonly field: Field,
        public _description: string | undefined,
        public readonly inputType: GraphQLInputType | CreateObjectInputType,
        public readonly deprecationReason?: string,
    ) {
        if (!_description) {
            this._description = this.field.description;
        }
    }

    get name() {
        return this.field.name;
    }

    get description() {
        return this._description;
    }

    getProperties(value: AnyValue, context: FieldContext) {
        if (value === undefined && this.field.hasDefaultValue) {
            value = this.field.defaultValue;
        }

        value = this.coerceValue(value, context);

        return {
            [this.field.name]: value,
        };
    }

    protected coerceValue(value: AnyValue, context: FieldContext): AnyValue {
        if (
            this.field.type.isScalarType &&
            this.field.type.graphQLScalarType === GraphQLOffsetDateTime &&
            value instanceof ZonedDateTime
        ) {
            return serializeForStorage(value);
        }
        return value;
    }

    collectAffectedFields(value: AnyValue, fields: Set<Field>, context: FieldContext) {
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

    validateInContext(value: AnyValue, context: FieldValidationContext) {}
}

export class BasicListCreateInputField extends BasicCreateInputField {
    protected coerceValue(value: AnyValue, context: FieldContext): AnyValue {
        // null is not a valid list value - if the user specified it, coerce it to [] to not have a mix of [] and
        // null in the database
        let listValue = isReadonlyArray(value) ? value : [];
        return listValue.map((itemValue) => super.coerceValue(itemValue, context));
    }
}

export class CreateObjectInputField extends BasicCreateInputField {
    constructor(
        field: Field,
        public readonly objectInputType: CreateObjectInputType,
        inputType?: GraphQLInputType,
    ) {
        super(field, undefined, inputType || objectInputType.getInputType());
    }

    protected coerceValue(value: AnyValue, context: FieldContext): AnyValue {
        value = super.coerceValue(value, context);
        if (value == undefined) {
            return value;
        }
        return this.objectInputType.prepareValue(value as PlainObject, context);
    }

    collectAffectedFields(value: AnyValue, fields: Set<Field>, context: FieldContext) {
        super.collectAffectedFields(value, fields, context);
        if (value == undefined) {
            return;
        }

        this.objectInputType.collectAffectedFields(value as PlainObject, fields, context);
    }
}

export class CreateReferenceInputField extends BasicCreateInputField {
    constructor(
        field: Field,
        private readonly _name: string,
        description: string | undefined,
        inputType: GraphQLInputType | CreateObjectInputType,
        deprecationReason?: string,
    ) {
        super(field, description, inputType, deprecationReason);
    }

    get name() {
        return this._name;
    }

    validateInContext(value: AnyValue, context: FieldValidationContext) {
        // if there are two fields to specify the reference key, users must only specify one
        // if this is the legacy field (named after the reference field), complain if the key field is set, too
        if (this.field.name !== this.name && this.field.name in context.objectValue) {
            throw createGraphQLError(
                `Cannot set both "${this.field.name}" and "${this.name}" because they refer to the same reference`,
                context,
            );
        }
    }
}

export class ObjectListCreateInputField extends BasicCreateInputField {
    constructor(field: Field, public readonly objectInputType: CreateObjectInputType) {
        super(
            field,
            undefined,
            new GraphQLList(new GraphQLNonNull(objectInputType.getInputType())),
        );
    }

    protected coerceValue(value: AnyValue, context: FieldContext): AnyValue {
        value = super.coerceValue(value, context);
        if (value === null) {
            // null is not a valid list value - if the user specified it, coerce it to [] to not have a mix of [] and
            // null in the database
            return [];
        }
        if (value === undefined) {
            return undefined;
        }
        if (!isReadonlyArray(value)) {
            throw new Error(
                `Expected value for "${this.name}" to be an array, but is "${typeof value}"`,
            );
        }
        return value.map((value) =>
            this.objectInputType.prepareValue(value as PlainObject, context),
        );
    }

    collectAffectedFields(value: AnyValue, fields: Set<Field>, context: FieldContext) {
        super.collectAffectedFields(value, fields, context);
        if (value == undefined) {
            return;
        }
        if (!isReadonlyArray(value)) {
            throw new Error(
                `Expected value for "${this.name}" to be an array, but is "${typeof value}"`,
            );
        }

        value.forEach((value) =>
            this.objectInputType.collectAffectedFields(value as PlainObject, fields, context),
        );
    }
}

export class CreateEntityExtensionInputField extends CreateObjectInputField {
    protected coerceValue(value: AnyValue, context: FieldContext): AnyValue {
        // this should always be an object so the default values of entity extensions apply
        return super.coerceValue(value == undefined ? {} : value, context);
    }

    appliesToMissingFields() {
        // this is important because we always fall back to {} to get apply default values in the entity extension type
        return true;
    }
}
