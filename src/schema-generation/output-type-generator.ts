import { GraphQLString } from 'graphql';
import { sortBy } from 'lodash';
import memorize from 'memorize-decorator';
import { FieldRequest } from '../graphql/query-distiller';
import { isListType } from '../graphql/schema-utils';
import { Field, ObjectType, Type } from '../model';
import {
    NullQueryNode, ObjectQueryNode, PropertySpecification, QueryNode, UnaryOperationQueryNode, UnaryOperator
} from '../query-tree';
import { CURSOR_FIELD } from '../schema/schema-defaults';
import { EnumTypeGenerator } from './enum-type-generator';
import { createFieldNode } from './field-nodes';
import { ListAugmentation } from './list-augmentation';
import { OrderByEnumGenerator, OrderByEnumType } from './order-by-enum-generator';
import { makeNonNullableList, QueryNodeField, QueryNodeOutputType } from './query-node-object-type';
import { getOrderByValues } from './utils/pagination';

export class OutputTypeGenerator {
    constructor(
        private readonly listAugmentation: ListAugmentation,
        private readonly enumTypeGenerator: EnumTypeGenerator,
        private readonly orderByEnumGenerator: OrderByEnumGenerator
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
            fields: () => this.getFields(objectType)
        };
    }

    private getFields(objectType: ObjectType): ReadonlyArray<QueryNodeField> {
        const fields = objectType.fields.map(field => this.createField(field));

        // include cursor fields in all types that could occur in lists
        const specialFields = objectType.isEntityExtensionType ? [] : [
            this.createCursorField(objectType)
        ];

        return [
            ...fields,
            ...specialFields
        ];
    }

    private createCursorField(objectType: ObjectType): QueryNodeField {
        const orderByType = this.orderByEnumGenerator.generate(objectType);
        return {
            name: CURSOR_FIELD,
            type: GraphQLString,
            resolve: (source, args, info) => this.getCursorNode(source, info.fieldRequestStack[info.fieldRequestStack.length - 2], orderByType)
        };
    }

    private getCursorNode(itemNode: QueryNode, listFieldRequest: FieldRequest | undefined, orderByType: OrderByEnumType): QueryNode {
        if (!listFieldRequest || !isListType(listFieldRequest.field.type)) {
            return NullQueryNode.NULL;
        }

        const clauses = getOrderByValues(listFieldRequest.args, orderByType);
        const sortedClauses = sortBy(clauses, clause => clause.name);
        const objectNode = new ObjectQueryNode(sortedClauses.map( clause =>
            new PropertySpecification(clause.underscoreSeparatedPath, clause.getValueNode(itemNode))));
        return new UnaryOperationQueryNode(objectNode, UnaryOperator.JSON_STRINGIFY);
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
