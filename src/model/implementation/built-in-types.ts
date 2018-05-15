import { Type } from './type';
import { ScalarType } from './scalar-type';
import { TypeKind } from '../input';
import { GraphQLBoolean, GraphQLFloat, GraphQLID, GraphQLInt, GraphQLScalarType, GraphQLString } from 'graphql';
import GraphQLJSON = require('graphql-type-json');
import { GraphQLDateTime } from '../../schema/scalars/date-time';

const graphQLTypes: ReadonlyArray<GraphQLScalarType> = [
    GraphQLID,
    GraphQLString,
    GraphQLBoolean,
    GraphQLInt,
    GraphQLFloat,
    GraphQLJSON,
    GraphQLDateTime
];

export const builtInTypes: ReadonlyArray<Type> = graphQLTypes.map(({name}) => buildScalarType(name));

function buildScalarType(name: string) {
    return new ScalarType({
        kind: TypeKind.SCALAR,
        name
    });
}
