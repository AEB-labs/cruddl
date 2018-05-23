import memorize from 'memorize-decorator';
import { Field, ObjectType, Type } from '../model';
import { FieldQueryNode, TransformListQueryNode, VariableQueryNode } from '../query-tree';
import { FILTER_ARG } from '../schema/schema-defaults';
import { decapitalize } from '../utils/utils';
import { FilterTypeGenerator } from './filter-type-generator';
import { makeNonNullableList, QueryNodeField, QueryNodeOutputType } from './query-node-object-type';
import { buildSafeListQueryNode } from './query-node-utils';

let nextIndex = 0;

export class OutputTypeGenerator {
    private index = nextIndex++;

    constructor(
        private readonly filterTypeGenerator: FilterTypeGenerator
    ) {

    }

    @memorize()
    generate(type: Type): QueryNodeOutputType {
        console.log(`OutputTypeGenerator${this.index}.generate(${type.name})`);
        if (type.isObjectType) {
            return this.generateObjectType(type);
        }
        if (type.isScalarType) {
            return type.graphQLScalarType;
        }
        throw new Error(`not implemented yet`);
    }

    private generateObjectType(objectType: ObjectType): QueryNodeOutputType {
        return {
            name: objectType.name,
            description: objectType.description,
            fields: objectType.fields.map(field => this.createField(field))
        };
    }
    private createField(field: Field): QueryNodeField {
        let schemaField = this.createSimpleField(field);
        if (field.isList) {
            schemaField = this.augmentListField(field, schemaField);
        }
        return schemaField;
    }

    private augmentListField(field: Field, schemaField: QueryNodeField): QueryNodeField {
        if (!field.type.isObjectType) {
            return schemaField;
        }

        const filterType = this.filterTypeGenerator.generate(field.type);

        return {
            ...schemaField,
            args: {
                ...schemaField.args,
                [FILTER_ARG]: {
                    type: filterType.getInputType()
                }
            },
            resolve: (sourceNode, args) => {
                let listNode = schemaField.resolve(sourceNode, args);
                listNode = buildSafeListQueryNode(listNode);
                const itemVariable = new VariableQueryNode(decapitalize(field.type.name));
                const filterValue = args[FILTER_ARG];
                const filterNode = filterValue != undefined ? filterType.getFilterNode(itemVariable, args[FILTER_ARG]) : undefined;
                return new TransformListQueryNode({
                    listNode,
                    itemVariable,
                    filterNode
                });
            }
        };
    };

    private createSimpleField(field: Field): QueryNodeField {
        const type = this.generate(field.type);
        return {
            name: field.name,
            type: field.isList ? makeNonNullableList(type) : type,
            resolve: (sourceNode) => new FieldQueryNode(sourceNode, field)
        };
    }
}
