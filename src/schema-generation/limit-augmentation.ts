import { GraphQLInt, GraphQLList, GraphQLNonNull, GraphQLString } from 'graphql';
import { Type } from '../model';
import {
    BinaryOperationQueryNode,
    BinaryOperator,
    ConcatListsQueryNode,
    ConstBoolQueryNode,
    LiteralQueryNode,
    OrderDirection,
    OrderSpecification,
    QueryNode,
    RuntimeErrorQueryNode,
    TransformListQueryNode,
    VariableQueryNode,
} from '../query-tree';
import {
    AFTER_ARG,
    CURSOR_FIELD,
    FIRST_ARG,
    ID_FIELD,
    ORDER_BY_ARG,
    ORDER_BY_ASC_SUFFIX,
    SKIP_ARG,
} from '../schema/constants';
import { decapitalize } from '../utils/utils';
import { and } from './utils/input-types';
import { OrderByEnumGenerator, OrderByEnumType, OrderByEnumValue } from './order-by-enum-generator';
import { QueryNodeField } from './query-node-object-type';
import { getOrderByValues } from './utils/pagination';

/**
 * Augments meta fields with a "first" argument
 */
export class MetaFirstAugmentation {
    augment(schemaField: QueryNodeField): QueryNodeField {
        return {
            ...schemaField,
            args: {
                ...schemaField.args,
                [FIRST_ARG]: {
                    type: GraphQLInt,
                    description: `The number of items after which to stop counting (for performance reasons). Applied after "filter".`,
                },
            },
            resolve: (sourceNode, args, info) => {
                const listNode = schemaField.resolve(sourceNode, args, info);
                const maxCount: number | undefined = args[FIRST_ARG];
                if (maxCount == undefined) {
                    return listNode;
                }

                const itemVariable = new VariableQueryNode('item');
                return new TransformListQueryNode({
                    listNode,
                    itemVariable,
                    maxCount,
                });
            },
        };
    }
}
