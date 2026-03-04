import { GraphQLInt } from 'graphql';
import { CountQueryNode } from '../query-tree/index.js';
import { COUNT_META_FIELD, QUERY_META_TYPE } from '../schema/constants.js';
import { memoize } from '../utils/memoize.js';
import type { QueryNodeField, QueryNodeObjectType } from './query-node-object-type/index.js';

export class MetaTypeGenerator {
    @memoize()
    generate(): QueryNodeObjectType {
        return {
            name: QUERY_META_TYPE,
            description: 'Provides aggregated information about a collection or list',
            fields: [this.getCountField()],
        };
    }

    private getCountField(): QueryNodeField {
        return {
            name: COUNT_META_FIELD,
            type: GraphQLInt,
            description:
                'The number of items in the collection or list, after applying the filter if specified.',
            isPure: true,
            resolve: (listNode) => new CountQueryNode(listNode),
        };
    }
}
