import { GraphQLEnumType, GraphQLEnumValueConfig } from 'graphql';
import { chain } from 'lodash';
import memorize from 'memorize-decorator';
import { EnumType } from '../model';

export class EnumTypeGenerator {
    @memorize()
    generate(enumType: EnumType): GraphQLEnumType {
        return new GraphQLEnumType({
            name: enumType.name,
            description: enumType.description,
            values: chain(enumType.values)
                .keyBy((value) => value.value)
                .mapValues(
                    (value): GraphQLEnumValueConfig => ({
                        value: value.value,
                        description: value.description,
                        deprecationReason: value.deprecationReason,
                    }),
                )
                .value(),
        });
    }
}
