import { Type } from './type';
import { ScalarType } from './scalar-type';
import { TypeKind } from '../config';
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

export const builtInTypes: ReadonlyArray<Type> = graphQLTypes.map(type => buildScalarType(type));

export const builtInTypeNames: ReadonlySet<string> = new Set(builtInTypes.map(t => t.name));

function buildScalarType(type: GraphQLScalarType) {
    return new ScalarType({
        kind: TypeKind.SCALAR,
        name: type.name,
    }, type);
}
