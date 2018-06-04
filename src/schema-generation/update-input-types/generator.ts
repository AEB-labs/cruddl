import { GraphQLID, GraphQLList, GraphQLNonNull } from 'graphql';
import { flatMap } from 'lodash';
import memorize from 'memorize-decorator';
import { ChildEntityType, EntityExtensionType, Field, RootEntityType } from '../../model';
import { ID_FIELD } from '../../schema/schema-defaults';
import { CreateInputTypeGenerator } from '../create-input-types';
import { EnumTypeGenerator } from '../enum-type-generator';
import {
    BasicListUpdateInputField, BasicUpdateInputField, UpdateEntityExtensionInputField, UpdateFilterInputField,
    UpdateInputField, UpdateValueObjectInputField, UpdateValueObjectListInputField
} from './input-fields';
import { UpdateEntityExtensionInputType, UpdateObjectInputType, UpdateRootEntityInputType } from './input-types';

export class UpdateInputTypeGenerator {
    constructor(
        private readonly enumTypeGenerator: EnumTypeGenerator,
        private readonly createInputTypeGenerator: CreateInputTypeGenerator
    ) {
    }

    @memorize()
    generate(type: RootEntityType|EntityExtensionType|ChildEntityType): UpdateObjectInputType {
        if (type.isRootEntityType) {
            return this.generateForRootEntityType(type);
        }
        if (type.isEntityExtensionType) {
            return this.generateForEntityExtensionType(type);
        }
        if (type.isChildEntityType) {
            throw new Error('todo');
        }
        throw new Error(`Unsupported type ${(type as any).kind} for update input type generation`);
    }

    @memorize()
    generateForRootEntityType(type: RootEntityType): UpdateRootEntityInputType {
        return new UpdateRootEntityInputType(type, `Update${type.name}Input`,
            () => flatMap(type.fields, (field: Field) => this.generateFields(field)));
    }

    @memorize()
    generateForEntityExtensionType(type: EntityExtensionType): UpdateEntityExtensionInputType {
        return new UpdateEntityExtensionInputType(`Update${type.name}Input`,
            () => flatMap(type.fields, (field: Field) => this.generateFields(field)));
    }

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

        if (field.type.isEntityExtensionType) {
            const inputType = this.generate(field.type);
            return [new UpdateEntityExtensionInputField(field, inputType)];
        }

        // TODO
        return [];
        //throw new Error('todo');
    }
}
