import { Source } from 'graphql';
import * as fs from 'fs';
import { addQueryResolvers, ArangoDBAdapter } from '../..';
import { GraphQLServer } from './graphql-server';
import { createSchema } from '../../src/schema/schema-builder';
import { SchemaConfig, SchemaPartConfig } from '../../src/config/schema-config';
import { globalContext } from '../../src/config/global';

const port = 3000;
const databaseName = 'momo';
const databaseURL = 'http://root:@localhost:8529';

export async function start() {
    const db = new ArangoDBAdapter({
        databaseName,
        url: databaseURL,
        autocreateIndices: true,
        autoremoveIndices: true
    });

    const schemaConfig: SchemaConfig = {
        schemaParts: fs.readdirSync('spec/dev/model').map(file => fileToSchemaPartConfig('spec/dev/model/' + file)),
        // defaultNamespace: "model"
    };

    const schema = createSchema(schemaConfig);

    const executableSchema = addQueryResolvers(schema, db);
    const logger = globalContext.loggerProvider.getLogger('server');
    logger.info('Making sure schema is up to date...');
    await db.updateSchema(executableSchema);
    logger.info('Schema is up to date');

    new GraphQLServer({
        port, schema: executableSchema
    });
}

function fileToSchemaPartConfig(path: string): SchemaPartConfig {
    return {
        source: new Source(fs.readFileSync(path).toString(), path),
        // localNamespace: path.match(/.*\/(.*).graphqls/)![1]
    };
}
