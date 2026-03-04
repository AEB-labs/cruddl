import type { GraphQLEnumValueConfig } from 'graphql';
import { GraphQLEnumType } from 'graphql';
import type { EnumType } from '../model/index.js';
import { memoize } from '../utils/memoize.js';

export class EnumTypeGenerator {
    @memoize()
    generate(enumType: EnumType): GraphQLEnumType {
        return new GraphQLEnumType({
            name: enumType.name,
            description: enumType.description,
            values: Object.fromEntries(
                enumType.values.map((value): [string, GraphQLEnumValueConfig] => [
                    value.value,
                    {
                        value: value.value,
                        description: value.description,
                        deprecationReason: value.deprecationReason,
                    },
                ]),
            ),
        });
    }
}
