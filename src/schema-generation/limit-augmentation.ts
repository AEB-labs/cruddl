import { GraphQLInt } from 'graphql';
import { TransformListQueryNode, VariableQueryNode } from '../query-tree/index.js';
import { FIRST_ARG } from '../schema/constants.js';
import { isDefined } from '../utils/utils.js';
import type { QueryNodeField } from './query-node-object-type/index.js';

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
                if (!isDefined(maxCount)) {
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
