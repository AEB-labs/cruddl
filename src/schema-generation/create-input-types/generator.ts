import { GraphQLList, GraphQLNonNull } from 'graphql';
import { flatMap } from 'lodash';
import memorize from 'memorize-decorator';
import { ChildEntityType, EntityExtensionType, Field, ObjectType, RootEntityType, ValueObjectType } from '../../model';
import { EnumTypeGenerator } from '../enum-type-generator';
import {
    BasicCreateInputField,
    BasicListCreateInputField,
    CreateEntityExtensionInputField,
    CreateInputField,
    CreateObjectInputField,
    CreateReferenceInputField,
    ObjectListCreateInputField
} from './input-fields';
import {
    CreateChildEntityInputType,
    CreateEntityExtensionInputType,
    CreateObjectInputType,
    CreateRootEntityInputType,
    ValueObjectInputType
} from './input-types';
import {
    AddEdgesCreateInputField,
    CreateAndAddEdgesCreateInputField,
    CreateAndSetEdgeCreateInputField,
    SetEdgeCreateInputField
} from './relation-fields';

export class CreateInputTypeGenerator {
    constructor(private readonly enumTypeGenerator: EnumTypeGenerator) {}

    @memorize()
    generate(type: ObjectType): CreateObjectInputType {
        if (type.isRootEntityType) {
            return this.generateForRootEntityType(type);
        }
        if (type.isChildEntityType) {
            return this.generateForChildEntityType(type);
        }
        if (type.isEntityExtensionType) {
            return this.generateForEntityExtensionType(type);
        }
        return this.generateForValueObjectType(type);
    }

    @memorize()
    generateForRootEntityType(type: RootEntityType): CreateRootEntityInputType {
        return new CreateRootEntityInputType(type, () =>
            flatMap(type.fields, (field: Field) => this.generateFields(field))
        );
    }

    @memorize()
    generateForChildEntityType(type: ChildEntityType): CreateChildEntityInputType {
        return new CreateChildEntityInputType(type, () =>
            flatMap(type.fields, (field: Field) => this.generateFields(field))
        );
    }

    @memorize()
    generateForEntityExtensionType(type: EntityExtensionType): CreateObjectInputType {
        return new CreateEntityExtensionInputType(type, () =>
            flatMap(type.fields, (field: Field) => this.generateFields(field))
        );
    }

    @memorize()
    generateForValueObjectType(type: ValueObjectType): CreateObjectInputType {
        return new ValueObjectInputType(type, () => flatMap(type.fields, (field: Field) => this.generateFields(field)));
    }

    private generateFields(field: Field): CreateInputField[] {
        if (field.isSystemField) {
            return [];
        }

        if (field.isCollectField) {
            // collect fields are calculated fields and thus can not be set
            return [];
        }

        if (field.type.isScalarType || field.type.isEnumType) {
            const inputType = field.type.isEnumType
                ? this.enumTypeGenerator.generate(field.type)
                : field.type.graphQLScalarType;
            if (field.isList) {
                // don't allow null values in lists
                return [
                    new BasicListCreateInputField(field, undefined, new GraphQLList(new GraphQLNonNull(inputType)))
                ];
            } else if (field.referenceField) {
                // this is the key field to a reference field - add some comments
                return [
                    new BasicCreateInputField(
                        field,
                        (field.description ? field.description + '\n\n' : '') +
                        (field.referenceField.type as RootEntityType).keyField
                            ? 'Specify the `' +
                              (field.referenceField.type as RootEntityType).keyField!.name +
                              '` of the `' +
                              field.referenceField.type.name +
                              '` to be referenced'
                            : undefined,
                        inputType
                    )
                ];
            } else {
                return [new BasicCreateInputField(field, undefined, inputType)];
            }
        }

        if (field.type.isRootEntityType) {
            if (field.isRelation) {
                const inputType = this.generateForRootEntityType(field.type);
                if (field.isList) {
                    return [
                        new AddEdgesCreateInputField(field),
                        new CreateAndAddEdgesCreateInputField(field, inputType)
                    ];
                } else {
                    return [new SetEdgeCreateInputField(field), new CreateAndSetEdgeCreateInputField(field, inputType)];
                }
            }
            if (field.isReference) {
                // reference
                const referenceKeyField = field.getReferenceKeyFieldOrThrow();
                const scalarType = field.type.getKeyFieldTypeOrThrow().graphQLScalarType;
                const description =
                    (referenceKeyField.description ? referenceKeyField.description + '\n\n' : '') +
                    (field.type as RootEntityType).keyField
                        ? 'Specify the `' +
                          (field.type as RootEntityType).keyField!.name +
                          '` of the `' +
                          field.type.name +
                          '` to be referenced'
                        : undefined;

                if (referenceKeyField === field) {
                    // if the key field *is* the reference field, this means that there is no explicit key field
                    return [new CreateReferenceInputField(referenceKeyField, field.name, description, scalarType)];
                } else {
                    // there is a separate key field. We still generate this field (for backwards-compatibility), but users should use the key field instead
                    return [
                        new CreateReferenceInputField(
                            referenceKeyField,
                            field.name,
                            description,
                            scalarType,
                            `Use "${referenceKeyField.name}" instead.`
                        )
                    ];
                }
            }

            throw new Error(`Field "${field.declaringType.name}.${field.name}" has an unexpected configuration`);
        }

        if (field.type.isEntityExtensionType) {
            const inputType = this.generateForEntityExtensionType(field.type);
            return [new CreateEntityExtensionInputField(field, inputType)];
        }

        // child entity, value object, entity extension
        const inputType = this.generate(field.type);
        const inputField = field.isList
            ? new ObjectListCreateInputField(field, inputType)
            : new CreateObjectInputField(field, inputType);
        return [inputField];
    }
}
