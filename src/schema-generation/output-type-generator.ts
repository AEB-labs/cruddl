import memorize from 'memorize-decorator';
import { Field, ObjectType, Type } from '../model';
import { FieldQueryNode, FirstOfListQueryNode, FollowEdgeQueryNode } from '../query-tree';
import { EnumTypeGenerator } from './enum-type-generator';
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
        let schemaField;
        if (field.isRelation) {
            if (field.isList) {
                schemaField = this.createToManyRelationField(field);
            } else {
                schemaField = this.createToOneRelationField(field);
            }
        } else {
            schemaField = this.createSimpleField(field);
        }
        // TODO references
        if (field.isList) {
            schemaField = this.listAugmentation.augment(schemaField, field.type);
        }
        return schemaField;
    }

    private createSimpleField(field: Field): QueryNodeField {
        const type = this.generate(field.type);
        return {
            name: field.name,
            type: field.isList ? makeNonNullableList(type) : type,
            resolve: (sourceNode) => new FieldQueryNode(sourceNode, field)
        };
    }

    private createToOneRelationField(field: Field): QueryNodeField {
        const type = this.generate(field.type);
        const relation = field.getRelationOrThrow();
        const side = relation.getFieldSide(field);
        return {
            name: field.name,
            type,
            resolve: (sourceNode) => new FirstOfListQueryNode(new FollowEdgeQueryNode(relation, sourceNode, side))
        };
    }

    private createToManyRelationField(field: Field): QueryNodeField {
        const type = this.generate(field.type);
        const relation = field.getRelationOrThrow();
        const side = relation.getFieldSide(field);
        return {
            name: field.name,
            type: makeNonNullableList(type),
            resolve: (sourceNode) => new FollowEdgeQueryNode(relation, sourceNode, side)
        };
    }
}
