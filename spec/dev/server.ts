import {  ArangoDBAdapter } from '../..';
import { globalContext } from '../../src/config/global';
import * as path from 'path';
import { loadProjectFromDir } from '../../src/project/project-from-fs';
import { InMemoryAdapter } from '../../src/database/inmemory';
import { GraphQLServer } from 'graphql-yoga';

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

    const project = await loadProjectFromDir(path.resolve(__dirname, '../regression/logistics/model'));
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
