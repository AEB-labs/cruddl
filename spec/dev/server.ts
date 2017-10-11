import {buildASTSchema, parse, Source} from 'graphql';
import * as fs from 'fs';
import { addQueryResolvers, ArangoDBAdapter } from '../..';
import { GraphQLServer } from './graphql-server';
import {createSchema} from "../../src/schema/schema-builder";

const port = 3000;
const databaseName = 'momo';
const databaseURL = 'http://root:@localhost:8529';

export async function start() {

    const db = new ArangoDBAdapter({
        databaseName,
        url: databaseURL
    });

    const model: Array<Source> = fs.readdirSync('spec/dev/model').map(file => fileToSource('spec/dev/model/' + file));

    // const model = parse(fs.readFileSync('./model.graphqls', 'utf-8'));
    // const schema = buildASTSchema(model);

    const schema = createSchema(model);

    const executableSchema = addQueryResolvers(schema, db);

    console.log('Making sure schema is up to date...');
    await db.updateSchema(executableSchema);
    console.log('Schema is up to date');

    const server = new GraphQLServer({
        port, schema: executableSchema
    });
}

function fileToSource(path: string): Source {
    return new Source(fs.readFileSync(path).toString(), path);
}
