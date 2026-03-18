import { GraphQLSchema } from 'graphql';
import { OperationResolver } from '../execution/operation-resolver.js';
import { addOperationBasedResolvers } from '../graphql/operation-based-resolvers.js';
import type { Model } from '../model/implementation/model.js';
import type { SchemaTransformationContext } from '../schema/preparation/transformation-pipeline.js';
import { QueryNodeObjectTypeConverter } from './query-node-object-type/convert.js';
import { RootTypesGenerator } from './root-types-generator.js';

export class SchemaGenerator {
    private readonly rootTypesGenerator: RootTypesGenerator;
    private readonly queryNodeObjectTypeConverter: QueryNodeObjectTypeConverter;
    private readonly operationResolver: OperationResolver;

    constructor(private context: SchemaTransformationContext) {
        this.operationResolver = new OperationResolver(context);
        this.rootTypesGenerator = new RootTypesGenerator(context.schemaOptions);
        this.queryNodeObjectTypeConverter = new QueryNodeObjectTypeConverter(this.context);
    }

    generate(model: Model) {
        const { queryType, mutationType, dumbSchema } = this.generateTypesAndDumbSchema(model);

        return addOperationBasedResolvers({
            schema: dumbSchema,
            getOperationIdentifier: this.context.getOperationIdentifier,
            operationResolver: async (op) => {
                const rootType = op.operation.operation === 'mutation' ? mutationType : queryType;
                let error: Error;
                try {
                    const res = await this.operationResolver.resolveOperation(op, rootType);
                    // report the profile before throwing
                    if (this.context.profileConsumer && res.profile) {
                        this.context.profileConsumer(res.profile);
                    }
                    if (res.error) {
                        error = res.error;
                    } else {
                        return res.data;
                    }
                } catch (e: any) {
                    error = e;
                }

                if (this.context.processError) {
                    throw this.context.processError(error, op);
                }
                throw error;
            },
        });
    }

    generateTypesAndDumbSchema(model: Model) {
        const queryType = this.rootTypesGenerator.generateQueryType(model);
        const mutationType = this.rootTypesGenerator.generateMutationType(model);
        const dumbSchema = new GraphQLSchema({
            query: this.queryNodeObjectTypeConverter.convertToGraphQLObjectType(queryType),
            mutation: this.queryNodeObjectTypeConverter.convertToGraphQLObjectType(mutationType),
        });
        return {
            queryType,
            mutationType,
            dumbSchema,
        };
    }
}
