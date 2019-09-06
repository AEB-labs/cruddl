import { GraphQLBoolean, GraphQLFloat, GraphQLID, GraphQLInt, GraphQLScalarType, GraphQLString } from 'graphql';
import { GraphQLJSON } from 'graphql-type-json';
import { GraphQLDateTime } from '../../schema/scalars/date-time';
import { GraphQLLocalDate } from '../../schema/scalars/local-date';
import { GraphQLLocalTime } from '../../schema/scalars/local-time';
import { TypeKind } from '../config';
import { Model } from './model';
import { ScalarType } from './scalar-type';
import { Type } from './type';

const graphQLTypes: ReadonlyArray<GraphQLScalarType> = [
    GraphQLID,
    GraphQLString,
    GraphQLBoolean,
    GraphQLInt,
    GraphQLFloat,
    GraphQLJSON,
    GraphQLDateTime,
    GraphQLLocalDate,
    GraphQLLocalTime
];

export const builtInTypeNames: ReadonlySet<string> = new Set(graphQLTypes.map(t => t.name));

export function createBuiltInTypes(model: Model): ReadonlyArray<Type> {
    return graphQLTypes.map(type => buildScalarType(type, model));
}

function buildScalarType(type: GraphQLScalarType, model: Model) {
    return new ScalarType({
        kind: TypeKind.SCALAR,
        name: type.name
    }, model, type);
}
