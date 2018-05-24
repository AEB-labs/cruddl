import { GraphQLList, GraphQLNonNull } from 'graphql';
import { flatMap } from 'lodash';
import memorize from 'memorize-decorator';
import { ChildEntityType, EntityExtensionType, Field, ObjectType, RootEntityType, ValueObjectType } from '../../model';
import { EnumTypeGenerator } from '../enum-type-generator';
import {
    BasicCreateInputField, BasicListCreateInputField, CreateInputField, ObjectCreateInputField,
    ObjectListCreateInputField
} from './input-fields';
import { CreateChildEntityInputType, CreateObjectInputType, CreateRootEntityInputType } from './input-types';
import { ToManyRelationCreateInputField, ToOneRelationCreateInputField } from './relation-fields';

export class CreateInputTypeGenerator {
    constructor(
        private readonly enumTypeGenerator: EnumTypeGenerator
    ) {
    }

    @memorize()
    generate(type: ObjectType): CreateObjectInputType {
        if (type.isRootEntityType) {
            return this.generateForRootEntityType(type);
        }
        if (type.isChildEntityType) {
            return this.generateForChildEntityType(type);
        }

        return this.generateForSimpleObjectType(type);
    }

    @memorize()
    generateForRootEntityType(type: RootEntityType): CreateRootEntityInputType {
        return new CreateRootEntityInputType(`Create${type.name}Input`,
            () => flatMap(type.fields, (field: Field) => this.generateFields(field)));
    }

    @memorize()
    generateForChildEntityType(type: ChildEntityType): CreateChildEntityInputType {
        return new CreateChildEntityInputType(`Create${type.name}Input`,
            () => flatMap(type.fields, (field: Field) => this.generateFields(field)));
    }

    @memorize()
    private generateForSimpleObjectType(type: EntityExtensionType | ValueObjectType): CreateObjectInputType {
        // TODO when implementing update input types, only use one input type for create+update
        return new CreateObjectInputType(`${type.name}Input`,
            () => flatMap(type.fields, (field: Field) => this.generateFields(field)));
    }

    private generateFields(field: Field): CreateInputField[] {
        if (field.isSystemField) {
            return [];
        }

        if (field.type.isScalarType || field.type.isEnumType) {
            const inputType = field.type.isEnumType ? this.enumTypeGenerator.generate(field.type) : field.type.graphQLScalarType;
            if (field.isList) {
                // don't allow null values in lists
                return [new BasicListCreateInputField(field, new GraphQLList(new GraphQLNonNull(inputType)))];
            } else {
                return [new BasicCreateInputField(field, inputType)];
            }
        }

        if (field.type.isRootEntityType) {
            if (field.isRelation) {
                if (field.isList) {
                    return [new ToManyRelationCreateInputField(field)];
                } else {
                    return [new ToOneRelationCreateInputField(field)];
                }
            } else {
                // reference
                // we intentionally do not check if the referenced object exists (loose coupling), so this behaves just
                // like a regular field
                return [new BasicCreateInputField(field, field.type.getKeyFieldTypeOrThrow().graphQLScalarType)];
            }
        }

        // child entity, value object, entity extension
        const inputType = this.generate(field.type);
        const inputField = field.isList ? new ObjectListCreateInputField(field, inputType) : new ObjectCreateInputField(field, inputType);
        return [inputField];
    }
}
