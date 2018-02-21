import { DatabaseAdapter } from '../database-adapter';
import { QueryNode } from '../../query/definition';
import { globalContext, Logger, SchemaContext } from '../../config/global';
import { ALL_QUERY_RESULT_VALIDATOR_FUNCTION_PROVIDERS } from '../../query/query-result-validators';
import { JSCompoundQuery, JSExecutableQuery } from './js';
import { getJSQuery } from './js-generator';
import { GraphQLSchema } from 'graphql';
import uuid = require('uuid');

export class InMemoryDB {
    private collections: { [name: string]: any[] } = {};

    getCollection(name: string) {
        if (!(name in this.collections)) {
            this.collections[name] = [];
        }
        return this.collections[name];
    }

    generateID() {
        return uuid();
    }
}

export class InMemoryAdapter implements DatabaseAdapter {
    private db = new InMemoryDB();
    private logger: Logger;

    constructor(private schemaContext?: SchemaContext, db = new InMemoryDB()) {
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
            const boundValues = query.boundValues;
            for (const key in query.usedPreExecResultNames) {
                boundValues[query.usedPreExecResultNames[key]] = resultHolder[key];
            }
            const db = this.db;

            // Execute the AQL query
            const result = eval(`(${query.code})`); // eval expects a statement, but code is an expression

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

    }
}
