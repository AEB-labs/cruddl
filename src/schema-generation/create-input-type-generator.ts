import { GraphQLInputType, GraphQLList, GraphQLNonNull } from 'graphql';
import { flatMap, fromPairs, toPairs } from 'lodash';
import memorize from 'memorize-decorator';
import { ChildEntityType, Field, ObjectType, RootEntityType } from '../model';
import { ENTITY_CREATED_AT, ENTITY_UPDATED_AT, ID_FIELD } from '../schema/schema-defaults';
import { AnyValue, PlainObject } from '../utils/utils';
import { TypedInputFieldBase, TypedInputObjectType } from './typed-input-object-type';
import uuid = require('uuid');

function getCurrentISODate() {
    return new Date().toISOString();
}

export class CreateObjectInputType extends TypedInputObjectType<CreateInputField> {
    constructor(
        name: string,
        fields: ReadonlyArray<CreateInputField>
    ) {
        super(name, fields);
    }

    prepareValue(value: PlainObject): PlainObject {
        const applicableFields = this.getApplicableInputFields(value);
        const properties = [
            ...flatMap(applicableFields, field => toPairs(field.getProperties(value[field.name]))),
            ...toPairs(this.getAdditionalProperties(value))
        ];
        return fromPairs(properties);
    }

    protected getAdditionalProperties(value: PlainObject): PlainObject {
        return {};
    }

    getAffectedFields(value: PlainObject): ReadonlyArray<Field> {
        const applicableFields = this.getApplicableInputFields(value);
        return flatMap(applicableFields, field => field.getAffectedFields(value[field.name]));
    }

    private getApplicableInputFields(value: PlainObject): ReadonlyArray<CreateInputField> {
        return this.fields.filter(field => field.name in value || field.appliesToMissingFields());
    }
}

export class CreateRootEntityInputType extends CreateObjectInputType {
    getAdditionalProperties() {
        const now = getCurrentISODate();
        return {
            [ENTITY_CREATED_AT]: now,
            [ENTITY_UPDATED_AT]: now
        };
    }

    // getRelationAddRemoveStatements() // TODO
}

export class CreateChildEntityInputType extends CreateObjectInputType {
    getAdditionalProperties() {
        const now = getCurrentISODate();
        return {
            [ID_FIELD]: uuid(),
            [ENTITY_CREATED_AT]: now,
            [ENTITY_UPDATED_AT]: now
        };
    }
}

export interface CreateInputField extends TypedInputFieldBase<CreateInputField> {
    getProperties(value: AnyValue): PlainObject;

    getAffectedFields(value: AnyValue): Field[];

    appliesToMissingFields(): boolean;
}

export class ScalarOrEnumCreateInputField implements CreateInputField {
    constructor(
        public readonly field: Field,
        public readonly inputType: GraphQLInputType
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

    getAffectedFields(value: AnyValue): Field[] {
        if (value === undefined) {
            // don't consider this field if it is just set to its default value
            // this enables permission-restricted fields with a non-critical default value
            return [];
        }

        return [this.field];
    }

    appliesToMissingFields() {
        return this.field.hasDefaultValue;
    }
}

export class ScalarOrEnumListCreateInputField extends ScalarOrEnumCreateInputField {
    getProperties(value: AnyValue) {
        return super.getProperties(value);
    }

    protected coerceValue(value: AnyValue): AnyValue {
        if (value === null) {
            // null is not a valid list value - if the user specified it, coerce it to [] to not have a mix of [] and
            // null in the database
            return [];
        }
        return value;
    }
}


export class CreateInputTypeGenerator {
    @memorize()
    generate(type: ObjectType): CreateObjectInputType {
        if (type.isRootEntityType) {
            return this.generateForRootEntityType(type);
        }
        if (type.isChildEntityType) {
            return this.generateForChildEntityType(type);
        }

        return new CreateObjectInputType(`Create${type.name}Input`,
            flatMap(type.fields, (field: Field) => this.generateFields(field)));
    }

    @memorize()
    generateForRootEntityType(type: RootEntityType): CreateRootEntityInputType {
        return new CreateRootEntityInputType(`Create${type.name}Input`,
            flatMap(type.fields, (field: Field) => this.generateFields(field)));
    }

    @memorize()
    generateForChildEntityType(type: ChildEntityType): CreateChildEntityInputType {
        return new CreateChildEntityInputType(`Create${type.name}Input`,
            flatMap(type.fields, (field: Field) => this.generateFields(field)));
    }

    private generateFields(field: Field): CreateInputField[] {
        if (field.isSystemField) {
            return [];
        }

        // TODO Also allow enum here (needs an EnumTypeGenerator)
        if (field.type.isScalarType) {
            if (field.isList) {
                // don't allow null values in lists
                return [new ScalarOrEnumListCreateInputField(field, new GraphQLList(new GraphQLNonNull(field.type.graphQLScalarType)))];
            } else {
                return [new ScalarOrEnumCreateInputField(field, field.type.graphQLScalarType)];
            }
        }

        return [];
    }
}
