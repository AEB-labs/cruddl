import {  ArangoDBAdapter } from '../..';
import { globalContext } from '../../src/config/global';
import * as path from 'path';
import { loadProjectFromDir } from '../../src/project/project-from-fs';
import { InMemoryAdapter } from '../../src/database/inmemory';
import { GraphQLServer } from 'graphql-yoga';
import { getMetaSchema } from '../../src/meta-schema/meta-schema';
import { Model } from '../../src/model/implementation/model';
import { Server } from 'http';
import { Server as HttpsServer } from 'https';

const port = 3000;
const databaseName = 'cruddl';
const databaseURL = 'http://root:@localhost:8529';

export async function start() {
    let db;
    if (process.argv.includes('--db=in-memory')) {
        db = new InMemoryAdapter();
    } else {
        db = new ArangoDBAdapter({
            databaseName,
            url: databaseURL,
            autocreateIndices: true,
            autoremoveIndices: true
        });
    }

    const project = await loadProjectFromDir(path.resolve(__dirname, './model'));
    const schema = project.createSchema(db);

    const logger = globalContext.loggerProvider.getLogger('server');
    logger.info('Making sure schema is up to date...');
    await db.updateSchema(project.getModel());
    logger.info('Schema is up to date');

    const server = new GraphQLServer({
        schema,
        context: () => ({ authRoles: ["allusers", "logistics-reader" ]})
    });
    await server.start({port});
    logger.info(`Server started on http://localhost:${port}`);
}

let expressServerReference: any;

/**
 * starts an active GraphQL endpoint for testing and debugging the meta server API
 * @param {Model} model the meta schema model used for the endpoint
 * @returns {Promise<void>} returns promise so that Mocha will wait till server was started
 */
export async function startMetaServer(model: Model) {
    const logger = globalContext.loggerProvider.getLogger('server');

    const metaSchemaPort = port+1;
    const metaSchemaServer = new GraphQLServer({
        schema: getMetaSchema(model)
    });
    expressServerReference = await metaSchemaServer.start({port: metaSchemaPort});
    logger.info(`Meta-Schema-Server started on http://localhost:${metaSchemaPort}`);
}

/**
 * stops the active GraphQL endpoint at the end of debugging/testing
 * @returns {Promise<void>} used for graceful shutdown at the end of a test session.
 */
export async function stopMetaServer() {
    const logger = globalContext.loggerProvider.getLogger('server');
    if(expressServerReference && expressServerReference.close){
        expressServerReference.close();
    }
    logger.info(`Meta-Schema-Server stopped`);
}
