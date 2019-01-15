import * as bodyParser from 'body-parser';
import * as cors from 'cors';
import * as express from 'express';
import { GraphQLServer } from 'graphql-yoga';
import * as path from 'path';
import { ArangoDBAdapter } from '../..';
import { globalContext } from '../../src/config/global';
import { InMemoryAdapter } from '../../src/database/inmemory';
import { getMetaSchema } from '../../src/meta-schema/meta-schema';
import { Model } from '../../src/model';
import { loadProjectFromDir } from '../../src/project/project-from-fs';
import { Log4jsLoggerProvider } from '../helpers/log4js-logger-provider';
import { createFastApp } from './fast-server';

const port = 3000;
const databaseName = 'cruddl';
const databaseURL = 'http://root:@localhost:8529';

export async function start() {
    const loggerProvider = new Log4jsLoggerProvider('trace');

    let db;
    if (process.argv.includes('--db=in-memory')) {
        db = new InMemoryAdapter(undefined, { loggerProvider });
    } else {
        db = new ArangoDBAdapter({
            databaseName,
            url: databaseURL,
            autocreateIndices: true,
            autoremoveIndices: true,
            enableExperimentalArangoJSInstrumentation: true,
            enableExperimentalProjectionIndirection: true,
            experimentalProjectionIndirectionTypeNames: ['BusinessMessage']
        }, { loggerProvider });
    }

    const project = await loadProjectFromDir(path.resolve(__dirname, './endress-hauser'), {
        profileConsumer: profile => {
            console.log(`${profile.operation.operation} ${profile.operation.name ? profile.operation.name.value : '<anonymous>'}: ${JSON.stringify(profile.timings, undefined, '  ')}`);
        },
        getExecutionOptions: () => ({
            authRoles: ['allusers', 'logistics-reader', 'system'],
            recordTimings: true,
            recordPlan: true,
            mutationMode: 'rollback',
            queryMemoryLimit: 1000000
        }),
        loggerProvider
    });
    const schema = project.createSchema(db);

    const logger = globalContext.loggerProvider.getLogger('server');
    logger.info('Making sure schema is up to date...');
    await db.updateSchema(project.getModel());
    logger.info('Schema is up to date');

    const server = new GraphQLServer({
        schema: schema as any // yoga declares a direct dependency to @types/graphql and it's 0.13
    });

    const fastServer = express();
    fastServer.use(cors());
    fastServer.use(bodyParser.json());
    fastServer.post('/', createFastApp(project, db));
    fastServer.listen(3002);

    await server.start({ port });
    logger.info(`Server started on http://localhost:${port}`);

    await startMetaServer(project.getModel());
}

let expressServerReference: any;

/**
 * starts an active GraphQL endpoint for testing and debugging the meta server API
 * @param {Model} model the meta schema model used for the endpoint
 * @returns {Promise<void>} returns promise so that Mocha will wait till server was started
 */
export async function startMetaServer(model: Model) {
    const logger = globalContext.loggerProvider.getLogger('server');

    const metaSchemaPort = port + 1;
    const metaSchemaServer = new GraphQLServer({
        schema: getMetaSchema(model) as any, // yoga declares a direct dependency to @types/graphql and it's 0.13
        context: { locale: 'en' }
    });
    expressServerReference = await metaSchemaServer.start({ port: metaSchemaPort });
    logger.info(`Meta-Schema-Server started on http://localhost:${metaSchemaPort}`);
}

/**
 * stops the active GraphQL endpoint at the end of debugging/testing
 * @returns {Promise<void>} used for graceful shutdown at the end of a test session.
 */
export async function stopMetaServer() {
    const logger = globalContext.loggerProvider.getLogger('server');
    if (expressServerReference && expressServerReference.close) {
        expressServerReference.close();
    }
    logger.info(`Meta-Schema-Server stopped`);
}
