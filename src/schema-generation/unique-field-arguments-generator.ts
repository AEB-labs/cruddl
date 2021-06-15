import { GraphQLFieldConfigArgumentMap, GraphQLID, GraphQLInputType, GraphQLType } from 'graphql';
import memorize from 'memorize-decorator';
import { RootEntityType, ScalarType, Type } from '../model';
import { ID_FIELD } from '../schema/constants';
import { EnumTypeGenerator } from './enum-type-generator';

export class UniqueFieldArgumentsGenerator {
    constructor(private readonly enumTypeGenerator: EnumTypeGenerator) {}

    @memorize()
    getArgumentsForUniqueFields(rootEntityType: RootEntityType): GraphQLFieldConfigArgumentMap {
        // theoretically, we could make the id field non-null if there is no key field. However, this would be a breaking
        // change for everyone that specifies the id field as (non-null) variable - which are probably quite a lot of
        // consumers. It wouldn't be consistent anyway (would not work if a key field exists)
        // Throwing if `null` is actually passed to `id` is breaking as well, but only if there is an error anyway, so
        // that's probably a lot less critical.

        return {
            [ID_FIELD]: {
                type: GraphQLID,
                description: rootEntityType.getFieldOrThrow('id').description
            },
            ...(rootEntityType.keyField
                ? {
                      [rootEntityType.keyField.name]: {
                          type: this.getAsGraphQLTypeOrThrow(rootEntityType.keyField.type),
                          description: rootEntityType.keyField.description
                      }
                  }
                : {})
        };
    }

    private getAsGraphQLTypeOrThrow(type: Type): GraphQLInputType {
        if (type.isScalarType) {
            return type.graphQLScalarType;
        }
        if (type.isEnumType) {
            return this.enumTypeGenerator.generate(type);
        }

        throw new Error(`Expected "${type.name}" to be a scalar or enum type, but is ${type.kind}`);
    }
}
