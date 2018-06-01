import { GraphQLList, GraphQLNonNull } from 'graphql';
import { Type } from '../model';
import { OrderSpecification, TransformListQueryNode, VariableQueryNode } from '../query-tree';
import { ORDER_BY_ARG } from '../schema/schema-defaults';
import { decapitalize } from '../utils/utils';
import { OrderByEnumGenerator } from './order-by-enum-generator';
import { QueryNodeField } from './query-node-object-type';
import { buildSafeListQueryNode } from './query-node-utils';

/**
 * Augments list fields with orderBy argument
 */
export class OrderByAugmentation {
    constructor(
        private readonly orderByEnumGenerator: OrderByEnumGenerator
    ) {
    }

    augment(schemaField: QueryNodeField, type: Type): QueryNodeField {
        if (!type.isObjectType) {
            return schemaField;
        }

        const orderByType = this.orderByEnumGenerator.generate(type);

        return {
            ...schemaField,
            args: {
                ...schemaField.args,
                [ORDER_BY_ARG]: {
                    type: new GraphQLList(new GraphQLNonNull(orderByType.getEnumType()))
                }
            },
            resolve: (sourceNode, args) => {
                let listNode = schemaField.resolve(sourceNode, args);
                listNode = buildSafeListQueryNode(listNode);
                const itemVariable = new VariableQueryNode(decapitalize(type.name));
                const argValues = args[ORDER_BY_ARG] as ReadonlyArray<string>|undefined;

                if (!argValues || !argValues.length) {
                    return listNode;
                }
                const mappedValues = argValues.map(value => orderByType.getValueOrThrow(value));
                const clauses = mappedValues.map(value => value.getClause(itemVariable));
                const orderBy = new OrderSpecification(clauses);
                return new TransformListQueryNode({
                    listNode,
                    itemVariable,
                    orderBy
                });
            }
        };
    };

}
