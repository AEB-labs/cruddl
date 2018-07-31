import { Model } from './model';
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

export const builtInTypeNames: ReadonlySet<string> = new Set(graphQLTypes.map(t => t.name));

export function createBuiltInTypes(model: Model): ReadonlyArray<Type> {
    return graphQLTypes.map(type => buildScalarType(type, model));
}

function buildScalarType(type: GraphQLScalarType, model: Model) {
    return new ScalarType({
        kind: TypeKind.SCALAR,
        name: type.name,
    }, model, type);
}
