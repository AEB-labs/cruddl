import { Source } from 'graphql';
import * as fs from 'fs';
import { addQueryResolvers, ArangoDBAdapter } from '../..';
import { GraphQLServer } from './graphql-server';
import { createSchema } from '../../src/schema/schema-builder';
import { SchemaConfig, SchemaPartConfig } from '../../src/config/schema-config';
import { globalContext } from '../../src/config/global';
import * as path from "path";

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

    const permissionProfilesPath = path.resolve(__dirname, 'model/permission-profiles.json');
    const schemaConfig: SchemaConfig = {
        schemaParts: fs.readdirSync(path.resolve(__dirname, 'model'))
            .filter(file => file.endsWith('.graphqls'))
            .map(file => fileToSchemaPartConfig(path.resolve(__dirname, 'model', file))),
        permissionProfiles: fs.existsSync(permissionProfilesPath) ? JSON.parse(fs.readFileSync(permissionProfilesPath, 'utf-8')) : undefined
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
