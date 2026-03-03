import { GraphQLInt } from 'graphql';
import { TransformListQueryNode, VariableQueryNode } from '../query-tree';
import { FIRST_ARG } from '../schema/constants';
import { QueryNodeField } from './query-node-object-type';

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
