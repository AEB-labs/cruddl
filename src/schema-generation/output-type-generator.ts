import memorize from 'memorize-decorator';
import { Field, ObjectType, Type } from '../model';
import { EnumTypeGenerator } from './enum-type-generator';
import { createFieldNode } from './field-nodes';
import { ListAugmentation } from './list-augmentation';
import { makeNonNullableList, QueryNodeField, QueryNodeOutputType } from './query-node-object-type';

export class OutputTypeGenerator {
    constructor(
        private readonly listAugmentation: ListAugmentation,
        private readonly enumTypeGenerator: EnumTypeGenerator
    ) {

    }

    generate(type: Type): QueryNodeOutputType {
        if (type.isObjectType) {
            return this.generateObjectType(type);
        }
        if (type.isScalarType) {
            return type.graphQLScalarType;
        }
        if (type.isEnumType) {
            return this.enumTypeGenerator.generate(type);
        }
        throw new Error(`Unsupported type kind: ${(type as Type).kind}`);
    }

    @memorize()
    private generateObjectType(objectType: ObjectType): QueryNodeOutputType {
        return {
            name: objectType.name,
            description: objectType.description,
            fields: () => objectType.fields.map(field => this.createField(field))
        };
    }

    private createField(field: Field): QueryNodeField {
        const type = this.generate(field.type);
        let schemaField: QueryNodeField = {
            name: field.name,
            type: field.isList ? makeNonNullableList(type) : type,
            resolve: (sourceNode) => createFieldNode(field, sourceNode)
        };

        if (field.isList) {
            schemaField = this.listAugmentation.augment(schemaField, field.type);
        }
        return schemaField;
    }

}
