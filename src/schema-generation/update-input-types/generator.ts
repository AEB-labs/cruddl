import { GraphQLID, GraphQLList, GraphQLNonNull } from 'graphql';
import { flatMap } from 'lodash';
import memorize from 'memorize-decorator';
import * as pluralize from 'pluralize';
import { ChildEntityType, EntityExtensionType, Field, RootEntityType } from '../../model';
import { ID_FIELD } from '../../schema/schema-defaults';
import { CreateInputTypeGenerator } from '../create-input-types';
import { EnumTypeGenerator } from '../enum-type-generator';
import {
    AddChildEntitiesInputField, BasicListUpdateInputField, BasicUpdateInputField, RemoveChildEntitiesInputField,
    UpdateChildEntitiesInputField, UpdateEntityExtensionInputField, UpdateFilterInputField, UpdateInputField,
    UpdateValueObjectInputField, UpdateValueObjectListInputField
} from './input-fields';
import {
    UpdateChildEntityInputType, UpdateEntityExtensionInputType, UpdateObjectInputType, UpdateRootEntityInputType
} from './input-types';
import { AddEdgesInputField, RemoveEdgesInputField, SetEdgeInputField } from './relation-fields';

export class UpdateInputTypeGenerator {
    constructor(
        private readonly enumTypeGenerator: EnumTypeGenerator,
        private readonly createInputTypeGenerator: CreateInputTypeGenerator
    ) {
    }

    @memorize()
    generate(type: RootEntityType | EntityExtensionType | ChildEntityType): UpdateObjectInputType {
        if (type.isRootEntityType) {
            return this.generateForRootEntityType(type);
        }
        if (type.isEntityExtensionType) {
            return this.generateForEntityExtensionType(type);
        }
        if (type.isChildEntityType) {
            return this.generateForChildEntityType(type);
        }
        throw new Error(`Unsupported type ${(type as any).kind} for update input type generation`);
    }

    @memorize()
    generateForRootEntityType(type: RootEntityType): UpdateRootEntityInputType {
        return new UpdateRootEntityInputType(type, `Update${type.name}Input`,
            () => flatMap(type.fields, (field: Field) => this.generateFields(field)));
    }

    @memorize()
    generateUpdateAllRootEntitiesInputType(type: RootEntityType): UpdateRootEntityInputType {
        return new UpdateRootEntityInputType(type, `UpdateAll${pluralize(type.name)}Input`,
            () => flatMap(type.fields, (field: Field) => this.generateFields(field, {
                skipID: true,
                skipRelations: true // can't do this properly at the moment because it would need a dynamic number of pre-execs
            })));
    }

    @memorize()
    generateForEntityExtensionType(type: EntityExtensionType): UpdateEntityExtensionInputType {
        return new UpdateEntityExtensionInputType(type, `Update${type.name}Input`,
            () => flatMap(type.fields, (field: Field) => this.generateFields(field)));
    }

    @memorize()
    generateForChildEntityType(type: ChildEntityType): UpdateChildEntityInputType {
        return new UpdateChildEntityInputType(type, `Update${type.name}Input`,
            () => flatMap(type.fields, (field: Field) => this.generateFields(field)));
    }

    private generateFields(field: Field, {skipID = false, skipRelations = false}: { skipID?: boolean, skipRelations?: boolean } = {}): UpdateInputField[] {
        if (field.isSystemField) {
            if (!skipID && (field.declaringType.isRootEntityType || field.declaringType.isChildEntityType) && field.name == ID_FIELD) {
                // id is always required because it is the filter
                // (unless skipID is true, then we have a special filter argument and can't set the id at all)
                return [new UpdateFilterInputField(field, new GraphQLNonNull(GraphQLID))];
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

        if (field.type.isChildEntityType) {
            return [
                new AddChildEntitiesInputField(field, this.createInputTypeGenerator.generateForChildEntityType(field.type)),
                new UpdateChildEntitiesInputField(field, this.generateForChildEntityType(field.type)),
                new RemoveChildEntitiesInputField(field)
            ];
        }

        if (field.isReference) {
            // we intentionally do not check if the referenced object exists (loose coupling), so this behaves just
            // like a regular field
            return [new BasicUpdateInputField(field, field.type.getKeyFieldTypeOrThrow().graphQLScalarType)];
        }

        if (field.isRelation) {
            if (skipRelations) {
                return [];
            }

            if (field.isList) {
                return [
                    new AddEdgesInputField(field),
                    new RemoveEdgesInputField(field)
                ];
            } else {
                return [new SetEdgeInputField(field)];
            }
        }

        throw new Error(`Field "${field.declaringType.name}.${field.name}" has an unexpected configuration`);
    }
}
