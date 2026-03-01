import { GraphQLString } from 'graphql';
import { TypeKind } from '../config/index.js';
import { Model } from './model.js';
import { ScalarType } from './scalar-type.js';

export class InvalidType extends ScalarType {
    constructor(name: string, model: Model) {
        super(
            {
                kind: TypeKind.SCALAR,
                name,
                graphQLScalarType: GraphQLString,
            },
            model,
        );
    }
}
