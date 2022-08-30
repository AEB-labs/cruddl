import {
    defaultFieldResolver,
    FragmentDefinitionNode,
    GraphQLFieldConfigMap,
    GraphQLFieldResolver,
    GraphQLObjectType,
    GraphQLResolveInfo,
    GraphQLSchema,
    OperationDefinitionNode,
} from 'graphql';
import { arrayToObject, objectValues } from '../utils/utils';

export interface OperationParams {
    readonly schema: GraphQLSchema;
    readonly operation: OperationDefinitionNode;
    readonly variableValues: { [name: string]: any };
    readonly fragments: { [fragmentName: string]: FragmentDefinitionNode };
    readonly context: any;
}

export interface FieldResolverParameters {
    readonly source: unknown;
    readonly args: unknown;
    readonly context: unknown;
    readonly info: GraphQLResolveInfo;
}

export interface AddOperationBasedResolversParams {
    readonly schema: GraphQLSchema;
    readonly operationResolver: (params: OperationParams) => Promise<any>;
    readonly getOperationIdentifier?: (params: FieldResolverParameters) => object | undefined;
}

export class NoOperationIdentifierError extends Error {
    constructor(message: string) {
        super(message);
        this.name = this.constructor.name;
    }
}

/**
 * Adds resolvers to a schema that can execute a whole operation at once
 * @param {GraphQLSchema} schema
 * @param {(params: OperationParams)} resolver the callback function used to resolve one operation
 */
export function addOperationBasedResolvers({
    schema,
    operationResolver,
    getOperationIdentifier,
}: AddOperationBasedResolversParams): GraphQLSchema {
    function convertType(type: GraphQLObjectType): GraphQLObjectType {
        const promises = new WeakMap<object, Promise<any>>();
        const resolveOp: GraphQLFieldResolver<any, any> = (source, args, context, info) => {
            const opInfo = { ...info, context };

            const operationIdentifier = getOperationIdentifier
                ? getOperationIdentifier({ source, args, context, info })
                : undefined;
            // we can resolve operations that just query one field without being able to identify an operation,
            // but if there are multiple root fields, we can't just call the operationResolver multiple times - it would
            // execute the whole operation multiple times. Also, it would break transactional guarantees.
            if (!operationIdentifier) {
                if (opInfo.operation.selectionSet.selections.some((s) => s.kind !== 'Field')) {
                    throw new NoOperationIdentifierError(
                        `Operations with top-level fragment spreads are not supported because no operationIdentifier is configured.`,
                    );
                }
                if (
                    opInfo.operation.selectionSet.selections.filter(
                        (s) => s.kind === 'Field' && !s.name.value.startsWith('__'),
                    ).length > 1
                ) {
                    throw new NoOperationIdentifierError(
                        `Operations with multiple top-level fields are not supported because no operationIdentifier is configured.`,
                    );
                }
                return operationResolver(opInfo);
            }
            const cached = promises.get(operationIdentifier);
            if (cached) {
                return cached;
            }
            const promise = operationResolver(opInfo);
            promises.set(operationIdentifier, promise);
            return promise;
        };

        const newFields: GraphQLFieldConfigMap<any, any> = {};
        for (const fieldName in type.getFields()) {
            const field = type.getFields()[fieldName];
            const oldResolver = field.resolve || defaultFieldResolver;
            newFields[fieldName] = {
                type: field.type,
                description: field.description,
                deprecationReason: field.deprecationReason,
                args: arrayToObject(field.args, (arg) => arg.name),
                resolve: async (oldSource, args, context, info) => {
                    const newSource = await resolveOp(oldSource, args, context, info);
                    if (newSource == undefined) {
                        return newSource;
                    }
                    return oldResolver(newSource, args, context, info);
                },
                astNode: field.astNode,
            };
        }

        return new GraphQLObjectType({
            ...type,
            fields: newFields,
        });
    }

    const query = schema.getQueryType();
    const mut = schema.getMutationType();
    const sub = schema.getSubscriptionType();
    return new GraphQLSchema({
        query: query ? convertType(query) : undefined,
        mutation: mut ? convertType(mut) : undefined,
        subscription: sub ? convertType(sub) : undefined,
        directives: Array.from(schema.getDirectives()),
        types: objectValues(schema.getTypeMap()).filter(
            (t) => t != mut && t != sub && t != schema.getQueryType(),
        ),
    });
}
