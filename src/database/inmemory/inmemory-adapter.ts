import { DatabaseAdapter } from '../database-adapter';
import { QueryNode } from '../../query/definition';
import { globalContext, Logger, SchemaContext } from '../../config/global';
import { ALL_QUERY_RESULT_VALIDATOR_FUNCTION_PROVIDERS } from '../../query/query-result-validators';
import { JSCompoundQuery, JSExecutableQuery } from './js';
import { getJSQuery } from './js-generator';
import { GraphQLObjectType, GraphQLSchema } from 'graphql';
import { isRelationField, isRootEntityType } from '../../schema/schema-utils';
import { flatMap, objectValues } from '../../utils/utils';
import { getCollectionNameForEdge, getCollectionNameForRootEntity } from './inmemory-basics';
import { getEdgeType } from '../../schema/edges';
import uuid = require('uuid');

export class InMemoryDB {
    collections: { [name: string]: any[] } = {};

    generateID() {
        return uuid();
    }
}

export class InMemoryAdapter implements DatabaseAdapter {
    private db = new InMemoryDB();
    private logger: Logger;

    constructor(options: { db?: InMemoryDB } = {}, private schemaContext?: SchemaContext) {
        if (options.db) {
            this.db = options.db;
        }
        globalContext.registerContext(schemaContext);
        try {
            this.logger = globalContext.loggerProvider.getLogger("InMemoryAdapter");
        } finally {
            globalContext.unregisterContext();
        }
    }

    /**
     * Gets the javascript source code for a function that executes a transaction
     * @returns {string}
     */
    private executeQueries(queries: JSExecutableQuery[]) {
        const validators = new Map(ALL_QUERY_RESULT_VALIDATOR_FUNCTION_PROVIDERS.map((provider): [string, Function] =>
            ([provider.getValidatorName(), provider.getValidatorFunction()])));

        let resultHolder: {[p: string]: any} = {};
        for (const query of queries) {
            const boundValues = query.boundValues; // used in eval'ed code
            for (const key in query.usedPreExecResultNames) {
                boundValues[query.usedPreExecResultNames[key]] = resultHolder[key];
            }
            const db = this.db; // used in eval'ed code

            // Execute the AQL query
            let result;
            try {
                result = eval(`(${query.code})`); // eval expects a statement, but code is an expression
            } catch (err) {
                throw err;
            }

            if (query.resultName) {
                resultHolder[query.resultName] = result;
            }

            if (query.resultValidator) {
                for (const key in query.resultValidator) {
                    const validator = validators.get(key);
                    if (validator) {
                        validator(query.resultValidator[key], result);
                    }
                }
            }
        }

        // the last query is always the main query, use its result as result of the transaction
        const lastQueryResultName = queries[queries.length - 1].resultName;
        if (lastQueryResultName) {
            return resultHolder[lastQueryResultName];
        } else {
            return undefined;
        }
    }

    async execute(queryTree: QueryNode) {
        globalContext.registerContext(this.schemaContext);
        let executableQueries: JSExecutableQuery[];
        let jsQuery: JSCompoundQuery;
        try {
            jsQuery = getJSQuery(queryTree);
            executableQueries = jsQuery.getExecutableQueries();
        } finally {
            globalContext.unregisterContext();
        }
        this.logger.debug(jsQuery.toColoredString());

        return this.executeQueries(executableQueries);
    }

    async updateSchema(schema: GraphQLSchema) {
        const rootEntities = objectValues(schema.getTypeMap()).filter(type => isRootEntityType(type)) as GraphQLObjectType[];

        const edgeTypes = flatMap(rootEntities, entity =>
            objectValues(entity.getFields())
                .filter(field => isRelationField(field))
                .map(field => getEdgeType(entity, field)));
        const requiredEdgeCollections = Array.from(new Set(edgeTypes.map(edge => getCollectionNameForEdge(edge))));

        const requiredCollections = rootEntities.map(entity => getCollectionNameForRootEntity(entity));
        for (const coll of [...requiredCollections, ...requiredEdgeCollections]) {
            if (!(coll in this.db.collections)) {
                this.db.collections[coll] = [];
            }
        }
    }
}
