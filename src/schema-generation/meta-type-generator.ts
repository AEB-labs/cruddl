import { GraphQLInt } from 'graphql';
import memorize from 'memorize-decorator';
import { CountQueryNode } from '../query-tree';
import { COUNT_META_FIELD, QUERY_META_TYPE } from '../schema/constants';
import { QueryNodeField, QueryNodeObjectType } from './query-node-object-type';

export class MetaTypeGenerator {
    @memorize()
    generate(): QueryNodeObjectType {
        return {
            name: QUERY_META_TYPE,
            fields: [this.getCountField()]
        };
    }

    private getCountField(): QueryNodeField {
        return {
            name: COUNT_META_FIELD,
            type: GraphQLInt,
            resolve: listNode => new CountQueryNode(listNode)
        };
    }
}
