import { Field, ObjectType, Type } from '../model';
import { FieldQueryNode } from '../query-tree';
import { makeNonNullableList, QueryNodeField, QueryNodeOutputType } from './query-node-object-type';

export class OutputTypeGenerator {
    generate(type: Type): QueryNodeOutputType {
        if (type.isObjectType) {
            return this.generateObjectType(type);
        }
        if (type.isScalarType) {
            return type.graphQLScalarType;
        }
        throw new Error(`not implemented yet`);
    }

    generateObjectType(objectType: ObjectType): QueryNodeOutputType {
        return {
            name: objectType.name,
            description: objectType.description,
            fields: objectType.fields.map(field => this.createField(field))
        };
    }

    private createField(field: Field): QueryNodeField {
        const type = this.generate(field.type);
        // TODO relations
        return {
            name: field.name,
            type: field.isList ? makeNonNullableList(type) : type,
            resolve: (sourceNode) => new FieldQueryNode(sourceNode, field)
        };
    }
}
