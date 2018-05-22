import { GraphQLInputType } from 'graphql';
import { flatMap } from 'lodash';
import memorize from 'memorize-decorator';
import { Field, ObjectType } from '../model';
import { TypedInputFieldBase, TypedInputObjectType } from './typed-input-object-type';

export class CreateObjectType extends TypedInputObjectType<CreateField> {
    constructor(
        name: string,
        fields: ReadonlyArray<CreateField>
    ) {
        super(name, fields);
    }
}

export class ScalarOrEnumCreateField implements CreateField {
    constructor(
        public readonly field: Field,
        public readonly inputType: GraphQLInputType
    ) {
    }

    get name() {
        return this.field.name;
    }
}

export interface CreateField extends TypedInputFieldBase<CreateField> {
}

export class CreateTypeGenerator {
    @memorize()
    generate(type: ObjectType): CreateObjectType {
        return new CreateObjectType(`Create${type.name}Input`,
            flatMap(type.fields, (field: Field) => this.generateFields(field)));
    }

    private generateFields(field: Field): CreateField[] {
        if (field.isList || !field.type.isScalarType) {
            return [];
        }

        return [
            new ScalarOrEnumCreateField(field, field.type.graphQLScalarType)
        ];
    }
}
