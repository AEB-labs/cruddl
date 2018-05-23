import { GraphQLInputType } from 'graphql';
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
        return flatMap(applicableFields, field => field.getAffectedFields());
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
    getAffectedFields(): Field[];
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

        return {
            [this.field.name]: value
        };
    }

    getAffectedFields(): Field[] {
        return [ this.field ];
    }

    appliesToMissingFields() {
        return this.field.hasDefaultValue;
    }
}

export class CreateTypeGenerator {
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

        if (field.isList || !field.type.isScalarType) {
            return [];
        }

        return [
            new ScalarOrEnumCreateInputField(field, field.type.graphQLScalarType)
        ];
    }
}
