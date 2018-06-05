import { GraphQLInt } from 'graphql';
import memorize from 'memorize-decorator';
import { ObjectType } from '../model/implementation';
import { CountQueryNode } from '../query-tree';
import { QueryNodeField, QueryNodeObjectType } from './query-node-object-type';

export class MetaTypeGenerator {
    @memorize()
    generate(objectType: ObjectType): QueryNodeObjectType {
        return {
            name: `${objectType.name}Meta`,
            fields: [this.getCountField()]
        };
    }

    private getCountField(): QueryNodeField {
        return {
            name: 'count',
            type: GraphQLInt,
            resolve: listNode => new CountQueryNode(listNode)
        };
    }
}