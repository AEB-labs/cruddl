import {
    GraphQLBoolean,
    GraphQLFloat,
    GraphQLID,
    GraphQLInt,
    GraphQLScalarType,
    GraphQLString,
} from 'graphql';
import { GraphQLDateTime } from '../../schema/scalars/date-time.js';
import {
    GraphQLDecimal1,
    GraphQLDecimal2,
    GraphQLDecimal3,
} from '../../schema/scalars/fixed-point-decimals.js';
import { GraphQLInt53 } from '../../schema/scalars/int53.js';
import { GraphQLJSONObject } from '../../schema/scalars/json-object.js';
import { GraphQLJSON } from '../../schema/scalars/json.js';
import { GraphQLLocalDate } from '../../schema/scalars/local-date.js';
import { GraphQLLocalTime } from '../../schema/scalars/local-time.js';
import { GraphQLOffsetDateTime } from '../../schema/scalars/offset-date-time.js';
import { GraphQLI18nString, GraphQLStringMap } from '../../schema/scalars/string-map.js';
import { TypeKind } from '../config/index.js';
import { ModuleSpecificationClauseConfig } from '../config/module-specification.js';
import { Model } from './model.js';
import { ScalarType } from './scalar-type.js';
import { Type } from './type.js';

const graphQLTypes: ReadonlyArray<GraphQLScalarType> = [
    GraphQLID,
    GraphQLString,
    GraphQLBoolean,
    GraphQLInt,
    GraphQLFloat,
    GraphQLJSON,
    GraphQLJSONObject,
    GraphQLStringMap,
    GraphQLI18nString,
    GraphQLDateTime,
    GraphQLLocalDate,
    GraphQLLocalTime,
    GraphQLOffsetDateTime,
    GraphQLInt53,
    GraphQLDecimal1,
    GraphQLDecimal2,
    GraphQLDecimal3,
];

const numberTypes: ReadonlyArray<GraphQLScalarType> = [
    GraphQLInt,
    GraphQLInt53,
    GraphQLFloat,
    GraphQLDecimal1,
    GraphQLDecimal2,
    GraphQLDecimal3,
];

export const builtInTypeNames: ReadonlySet<string> = new Set(graphQLTypes.map((t) => t.name));
export const numberTypeNames = numberTypes.map((t) => t.name);

export function createBuiltInTypes(model: Model): ReadonlyArray<Type> {
    return graphQLTypes.map((type) => buildScalarType(type, model));
}

function buildScalarType(type: GraphQLScalarType, model: Model) {
    return new ScalarType(
        {
            kind: TypeKind.SCALAR,
            name: type.name,
            isBuiltinType: true,
            description: type.description || undefined,
            graphQLScalarType: type,
            isNumberType: numberTypes.includes(type),
            moduleSpecification: model.options?.withModuleDefinitions
                ? {
                      in: model.modules.map(
                          (m): ModuleSpecificationClauseConfig => ({ expression: m.name }),
                      ),
                      includeAllFields: false,
                  }
                : undefined,

            // this is hacky, but the type names are defined statically within this file, so it should be ok
            fixedPointDecimalInfo: type.name.startsWith('Decimal')
                ? {
                      digits: Number(type.name.substring('Decimal'.length)),
                  }
                : undefined,
        },
        model,
    );
}
