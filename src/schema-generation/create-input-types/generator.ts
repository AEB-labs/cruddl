import type { GraphQLInputType } from 'graphql';
import { GraphQLList, GraphQLNonNull } from 'graphql';
import { memorize } from 'memorize-decorator';
import type {
    ChildEntityType,
    EntityExtensionType,
    Field,
    ObjectType,
    RootEntityType,
    ValueObjectType,
} from '../../model/index.js';
import type { EnumTypeGenerator } from '../enum-type-generator.js';
import type { CreateInputField } from './input-fields.js';
import {
    BasicCreateInputField,
    BasicListCreateInputField,
    CreateEntityExtensionInputField,
    CreateObjectInputField,
    CreateReferenceInputField,
    DummyCreateInputField,
    ObjectListCreateInputField,
} from './input-fields.js';
import type { CreateObjectInputType } from './input-types.js';
import {
    CreateChildEntityInputType,
    CreateEntityExtensionInputType,
    CreateRootEntityInputType,
    ValueObjectInputType,
} from './input-types.js';
import {
    AddEdgesCreateInputField,
    CreateAndAddEdgesCreateInputField,
    CreateAndSetEdgeCreateInputField,
    SetEdgeCreateInputField,
} from './relation-fields.js';

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
            type.fields.flatMap((field: Field) => this.generateFields(field)),
        );
    }

    @memorize()
    generateForChildEntityType(type: ChildEntityType): CreateChildEntityInputType {
        return new CreateChildEntityInputType(type, () =>
            type.fields.flatMap((field: Field) => this.generateFields(field)),
        );
    }

    @memorize()
    generateForEntityExtensionType(type: EntityExtensionType): CreateObjectInputType {
        return new CreateEntityExtensionInputType(type, () =>
            type.fields.flatMap((field: Field) => this.generateFields(field)),
        );
    }

    @memorize()
    generateForValueObjectType(type: ValueObjectType): CreateObjectInputType {
        return new ValueObjectInputType(type, () =>
            type.fields.flatMap((field: Field) => this.generateFields(field)),
        );
    }

    private generateFields(field: Field): ReadonlyArray<CreateInputField> {
        if (field.isSystemField) {
            return [];
        }

        // @collect fields generated input fields for a while, so to stay compatible, we keep them (but do nothing)
        if (field.isCollectField) {
            const deprecationReason = `Setting @collect fields is not possible. This dummy field will be removed soon.`;

            if (field.type.isRootEntityType) {
                // we never generated collect input fields on root entities
                return [];
            }

            let inputType: GraphQLInputType;
            if (field.type.isScalarType || field.type.isEnumType) {
                inputType = field.type.isEnumType
                    ? this.enumTypeGenerator.generate(field.type)
                    : field.type.graphQLScalarType;
            } else {
                inputType = this.generate(field.type).getInputType();
            }
            if (field.isList) {
                inputType = new GraphQLList(new GraphQLNonNull(inputType));
            }
            return [new DummyCreateInputField(field.name, inputType, { deprecationReason })];
        }

        if (field.isParentField || field.isRootField) {
            return [];
        }

        if (field.type.isScalarType || field.type.isEnumType) {
            const inputType = field.type.isEnumType
                ? this.enumTypeGenerator.generate(field.type)
                : field.type.graphQLScalarType;
            if (field.isList) {
                // don't allow null values in lists
                return [
                    new BasicListCreateInputField(
                        field,
                        undefined,
                        new GraphQLList(new GraphQLNonNull(inputType)),
                    ),
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
                        inputType,
                    ),
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
                        new CreateAndAddEdgesCreateInputField(field, inputType),
                    ];
                } else {
                    return [
                        new SetEdgeCreateInputField(field),
                        new CreateAndSetEdgeCreateInputField(field, inputType),
                    ];
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
                    return [
                        new CreateReferenceInputField(
                            referenceKeyField,
                            field.name,
                            description,
                            scalarType,
                        ),
                    ];
                } else {
                    // there is a separate key field. We still generate this field (for backwards-compatibility), but users should use the key field instead
                    return [
                        new CreateReferenceInputField(
                            referenceKeyField,
                            field.name,
                            description,
                            scalarType,
                            `Use "${referenceKeyField.name}" instead.`,
                        ),
                    ];
                }
            }

            throw new Error(
                `Field "${field.declaringType.name}.${field.name}" has an unexpected configuration`,
            );
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
