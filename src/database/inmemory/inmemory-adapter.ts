import { globalContext } from '../../config/global';
import { ProjectOptions } from '../../config/interfaces';
import { Logger } from '../../config/logging';
import { Model, QuickSearchLanguage } from '../../model';
import { ALL_QUERY_RESULT_VALIDATOR_FUNCTION_PROVIDERS, QueryNode } from '../../query-tree';
import { flatMap } from '../../utils/utils';
import { DatabaseAdapter } from '../database-adapter';
import { likePatternToRegExp } from '../like-helpers';
import { getCollectionNameForRelation, getCollectionNameForRootEntity } from './inmemory-basics';
import { JSCompoundQuery, JSExecutableQuery } from './js';
import { getJSQuery } from './js-generator';
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

    constructor(options: { db?: InMemoryDB } = {}, private schemaContext?: ProjectOptions) {
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

        const support = {
            compare(lhs: string|boolean|number|null|undefined, rhs: string|boolean|number|null|undefined) {
                if (lhs == undefined) {
                    if (rhs == undefined) {
                        return 0;
                    }
                    return -1;
                }
                if (rhs == undefined) {
                    return 1;
                }

                if (typeof lhs == 'boolean') {
                    if (typeof rhs == 'boolean') {
                        return lhs < rhs ? -1 : lhs > rhs ? 1 : 0;
                    }
                    return -1;
                }
                if (typeof rhs == 'boolean') {
                    return 1;
                }

                if (typeof lhs == 'number') {
                    if (typeof rhs == 'number') {
                        return lhs < rhs ? -1 : lhs > rhs ? 1 : 0;
                    }
                    return -1;
                }
                if (typeof rhs == 'number') {
                    return 1;
                }

                if (typeof lhs == 'string') {
                    if (typeof rhs == 'string') {
                        return lhs < rhs ? -1 : lhs > rhs ? 1 : 0;
                    }
                    return -1;
                }
                if (typeof rhs == 'string') {
                    return 1;
                }

                return lhs < rhs ? -1 : lhs > rhs ? 1 : 0;
            },

            getMultiComparator<T>(...valueFns: [((item: T) => string|boolean|number|null|undefined), boolean][]) {
                if (valueFns.length == 0) {
                    return () => 0;
                }

                if (valueFns.length == 1) {
                    const [valueFn, invert] = valueFns[0];
                    return (lhs: T, rhs: T) => invert ? support.compare(valueFn(rhs), valueFn(lhs)) : support.compare(valueFn(lhs), valueFn(rhs));
                }

                if (valueFns.length == 2) {
                    const [valueFn1, invert1] = valueFns[0];
                    const [valueFn2, invert2] = valueFns[1];
                    return (lhs: T, rhs: T) => {
                        const comparison = invert1 ? support.compare(valueFn1(rhs), valueFn1(lhs)) : support.compare(valueFn1(lhs), valueFn1(rhs));
                        if (comparison != 0) {
                            return comparison;
                        }
                        return invert2 ? support.compare(valueFn2(rhs), valueFn2(lhs)) : support.compare(valueFn2(lhs), valueFn2(rhs));
                    };
                }

                return (lhs: T, rhs: T): number => {
                    for (const [valueFn, invert] of valueFns) {
                        const comparison = invert ? support.compare(valueFn(rhs), valueFn(lhs)) : support.compare(valueFn(lhs), valueFn(rhs));
                        if (comparison != 0) {
                            return comparison;
                        }
                    }
                    return 0;
                };
            },

            likePatternToRegExp
        };

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
                        try {
                            validator(query.resultValidator[key], result);
                        } catch (error) {
                            throw error;
                        }
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
        if (this.logger.isTraceEnabled()) {
            this.logger.trace(`Executing JavaScript: ${jsQuery.toColoredString()}`);
        }

        return this.executeQueries(executableQueries);
    }

    async updateSchema(model: Model) {
        const rootEntities = model.rootEntityTypes;
        const requiredEdgeCollections = Array.from(new Set(model.relations.map(getCollectionNameForRelation)));

        const requiredCollections = rootEntities.map(entity => getCollectionNameForRootEntity(entity));
        for (const coll of [...requiredCollections, ...requiredEdgeCollections]) {
            if (!(coll in this.db.collections)) {
                this.db.collections[coll] = [];
            }
        }
    }

    async tokenizeExpression(expression: string): Promise<ReadonlyArray<string>> {
        return flatMap(expression.split(' '), t => t.split('-'));
    }

    async tokenizeToCache(tokens: ReadonlyArray<[string, QuickSearchLanguage]>){
        // not supported for inmemory
    }

}
