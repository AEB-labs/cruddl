import { GraphQLInt, GraphQLList, GraphQLNonNull } from 'graphql';
import { Type } from '../model';
import { OrderSpecification, QueryNode, TransformListQueryNode, VariableQueryNode } from '../query-tree';
import { FIRST_ARG, ORDER_BY_ARG } from '../schema/schema-defaults';
import { decapitalize } from '../utils/utils';
import { OrderByEnumGenerator, OrderByEnumType } from './order-by-enum-generator';
import { QueryNodeField } from './query-node-object-type';
import { buildSafeListQueryNode } from './query-node-utils';

/**
 * Augments list fields with orderBy argument
 */
export class OrderByAndPaginationAugmentation {
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
                },
                [FIRST_ARG]: {
                    type: GraphQLInt
                }
            },
            resolve: (sourceNode, args) => {
                const listNode = buildSafeListQueryNode(schemaField.resolve(sourceNode, args));
                const itemVariable = new VariableQueryNode(decapitalize(type.name));

                const orderBy = this.getOrderSpecification(args, orderByType, itemVariable);
                const maxCount = args[FIRST_ARG];

                return new TransformListQueryNode({
                    listNode,
                    itemVariable,
                    orderBy,
                    maxCount
                });
            }
        };
    };

    private getOrderSpecification(args: any, orderByType: OrderByEnumType, itemNode: QueryNode) {
        const orderByValues = (args[ORDER_BY_ARG] || []) as ReadonlyArray<string>;
        const mappedValues = orderByValues.map(value => orderByType.getValueOrThrow(value));
        const clauses = mappedValues.map(value => value.getClause(itemNode));
        return new OrderSpecification(clauses);
    }

}
