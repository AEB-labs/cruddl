import { buildASTSchema, parse } from 'graphql';
import * as fs from 'fs';
import { addQueryResolvers, ArangoDBAdapter } from '../..';
import { GraphQLServer } from './graphql-server';

const port = 3000;
const databaseName = 'momo';
const databaseURL = 'http://root:@localhost:8529';

export async function start() {

    const db = new ArangoDBAdapter({
        databaseName,
        url: databaseURL
    });
    const model = parse(fs.readFileSync('./model.graphqls', 'utf-8'));
    const schema = buildASTSchema(model);
    const executableSchema = addQueryResolvers(schema, db);
    const server = new GraphQLServer({
        port, schema: executableSchema
    });
}
