import type { GraphQLEnumValueConfig } from 'graphql';
import { GraphQLEnumType } from 'graphql';
import { memorize } from 'memorize-decorator';
import type { EnumType } from '../model/implementation/enum-type.js';

export class EnumTypeGenerator {
    @memorize()
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
