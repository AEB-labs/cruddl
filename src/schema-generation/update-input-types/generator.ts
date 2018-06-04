import { GraphQLID, GraphQLList, GraphQLNonNull } from 'graphql';
import { flatMap } from 'lodash';
import memorize from 'memorize-decorator';
import { Field, ObjectType, RootEntityType } from '../../model';
import { ID_FIELD } from '../../schema/schema-defaults';
import { CreateInputTypeGenerator } from '../create-input-types';
import { EnumTypeGenerator } from '../enum-type-generator';
import {
    BasicListUpdateInputField, BasicUpdateInputField, UpdateFilterInputField, UpdateInputField,
    UpdateValueObjectInputField, UpdateValueObjectListInputField
} from './input-fields';
import { UpdateObjectInputType, UpdateRootEntityInputType } from './input-types';

export class UpdateInputTypeGenerator {
    constructor(
        private readonly enumTypeGenerator: EnumTypeGenerator,
        private readonly createInputTypeGenerator: CreateInputTypeGenerator
    ) {
    }

    @memorize()
    generate(type: ObjectType): UpdateObjectInputType {
        if (type.isRootEntityType) {
            return this.generateForRootEntityType(type);
        }
        throw new Error('todo');
        /*if (type.isChildEntityType) {
            return this.generateForChildEntityType(type);
        }

        return this.generateForSimpleObjectType(type);*/
    }

    @memorize()
    generateForRootEntityType(type: RootEntityType): UpdateRootEntityInputType {
        return new UpdateRootEntityInputType(type, `Update${type.name}Input`,
            () => flatMap(type.fields, (field: Field) => this.generateFields(field)));
    }

    /*@memorize()
    generateForChildEntityType(type: ChildEntityType): UpdateChildEntityInputType {
        return new UpdateRootEntityInputType(`Create${type.name}Input`,
            () => flatMap(type.fields, (field: Field) => this.generateFields(field)));
    }

    @memorize()
    private generateForSimpleObjectType(type: EntityExtensionType | ValueObjectType): UpdateObjectInputType {
        // TODO when implementing update input types, only use one input type for create+update
        return new UpdateRootEntityInputType(`${type.name}Input`,
            () => flatMap(type.fields, (field: Field) => this.generateFields(field)));
    }*/

    private generateFields(field: Field): UpdateInputField[] {
        if (field.isSystemField) {
            if ((field.declaringType.isRootEntityType || field.declaringType.isChildEntityType) && field.name == ID_FIELD) {
                return [new UpdateFilterInputField(field, GraphQLID)];
            }
            return [];
        }

        if (field.type.isScalarType || field.type.isEnumType) {
            const inputType = field.type.isEnumType ? this.enumTypeGenerator.generate(field.type) : field.type.graphQLScalarType;
            if (field.isList) {
                // don't allow null values in lists
                return [new BasicListUpdateInputField(field, new GraphQLList(new GraphQLNonNull(inputType)))];
            } else {
                return [new BasicUpdateInputField(field, inputType)];
            }
        }

        if (field.type.isValueObjectType) {
            const inputType = this.createInputTypeGenerator.generate(field.type);
            if (field.isList) {
                return [new UpdateValueObjectListInputField(field, inputType)];
            } else {
                return [new UpdateValueObjectInputField(field, inputType)];
            }
        }

        // TODO
        return [];
        //throw new Error('todo');
    }
}
