import { DatabaseAdapter } from '../database-adapter';
import { QueryNode } from '../../query/definition';
import { getAQLQuery } from './aql-generator';
import { Database } from 'arangojs';
import { GraphQLObjectType, GraphQLSchema } from 'graphql';
import { flatMap, objectValues } from '../../utils/utils';
import { isRelationField, isRootEntityType } from '../../schema/schema-utils';
import { getEdgeType } from '../../schema/edges';
import { getCollectionNameForEdge, getCollectionNameForRootEntity } from './arango-basics';
import { globalContext } from '../../config/global';
import { AQLExecutableQuery } from './aql';
import { ALL_QUERY_RESULT_VALIDATOR_FUNCTION_PROVIDERS } from '../../query/query-result-validators';

export interface ArangoDBConfig {
    readonly url: string;
    readonly user?: string;
    readonly password?: string;
    readonly databaseName: string;
}

export class ArangoDBAdapter implements DatabaseAdapter {
    private db: Database;
    private logger = globalContext.loggerProvider.getLogger('ArangoDBAdapter');
    private readonly arangoExecutionFunction: string;

    constructor(config: ArangoDBConfig) {
        this.db = new Database({
            url: config.url,
            databaseName: config.databaseName
        });
        if(config.user) {
            // Unfortunately the typings of arangojs do not include the method "useBasicAuth" although it is present in the implementation of arangojs.
            // Therefore we cast to any
            (this.db as any).useBasicAuth(config.user, config.password);
        }

        this.arangoExecutionFunction = this.buildUpArangoExecutionFunction();
    }

    /**
     * Gets the javascript source code for a function that executes a transaction
     * @returns {string}
     */
    private buildUpArangoExecutionFunction(): string {

        // The following function will be translated to a string and executed (as one transaction) within the
        // ArangoDB server itself. Therefore the next comment is necessary to instruct our test coverage tool
        // (https://github.com/istanbuljs/nyc) not to instrument the code with coverage instructions.

        /* istanbul ignore next */
        const arangoExecutionFunction = function (queries: AQLExecutableQuery[]) {
            const db = require("@arangodb").db;

            let validators: {[name:string]: (validationData: any, result:any) => void} = {};
            //inject_validators_here

            let resultHolder: {[p: string]: any} = {};
            for (const query of queries) {
                const boundValues = query.boundValues;
                for (const key in query.usedPreExecResultNames) {
                    boundValues[query.usedPreExecResultNames[key]] = resultHolder[key];
                }

                // Execute the AQL query
                const result = db._query(query.code, boundValues).next();

                if (query.resultName) {
                    resultHolder[query.resultName] = result;
                }

                if (query.resultValidator) {
                    for (const key in query.resultValidator) {
                        if (key in validators) {
                            validators[key](query.resultValidator[key], result);
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
        };


        const validatorProviders = ALL_QUERY_RESULT_VALIDATOR_FUNCTION_PROVIDERS.map(provider =>
            `[${JSON.stringify(provider.getValidatorName)}]: ${String(provider.getValidatorFunction())}`);

        const allValidatorFunctionsObjectString = `validators = {${validatorProviders.join(',\n')}}`;

        return String(arangoExecutionFunction)
            .replace('//inject_validators_here', allValidatorFunctionsObjectString);
    }


    async execute(queryTree: QueryNode) {
        //TODO Execute single statement AQL queries directly without "db.transaction"?
        const aqlQuery = getAQLQuery(queryTree);
        const executableQueries = aqlQuery.getExecutableQueries();

        this.logger.debug(aqlQuery.toColoredString());

        return await this.db.transaction(
            {
                read: aqlQuery.readAccessedCollections,
                write: aqlQuery.writeAccessedCollections
            },
            this.arangoExecutionFunction,
            executableQueries
        );
    }

    async updateSchema(schema: GraphQLSchema): Promise<void> {
        const rootEntities = objectValues(schema.getTypeMap()).filter(type => isRootEntityType(type)) as GraphQLObjectType[];
        const edgeTypes = flatMap(rootEntities, entity =>
            objectValues(entity.getFields())
                .filter(field => isRelationField(field))
                .map(field => getEdgeType(entity, field)));

        // Get existing collections in ArangoDB
        const colls = await this.db.collections();

        // Creating missing document collections in ArangoDB
        const requiredCollections = rootEntities.map(entity => getCollectionNameForRootEntity(entity));
        const existingCollections = colls.map(coll => (<any>coll).name); // typing for name missing
        const collectionsToCreate = requiredCollections.filter(c => existingCollections.indexOf(c) < 0);
        this.logger.info(`Creating collections ${collectionsToCreate.join(', ')}...`);
        const createTasks = collectionsToCreate.map(col => this.db.collection(col.toString()).create({waitForSync: false}));
        await Promise.all(createTasks);
        this.logger.info(`Done`);

        // TODO create indices

        // Creating missing edge collections in ArangoDB
        const requiredEdgeCollections = Array.from(new Set(edgeTypes.map(edge => getCollectionNameForEdge(edge))));
        const existingEdgeCollections = colls.map(coll => (<any>coll).name); // typing for name missing
        const edgeCollectionsToCreate = requiredEdgeCollections.filter(c => existingEdgeCollections.indexOf(c) < 0);
        this.logger.info(`Creating edge collections ${edgeCollectionsToCreate.join(', ')}...`);
        const createEdgeTasks = edgeCollectionsToCreate.map(col => this.db.edgeCollection(col.toString()).create({waitForSync: false}));
        await Promise.all(createEdgeTasks);
        this.logger.info(`Done`);
    }
}
