import { buildASTSchema, parse, print } from 'graphql';
import { createQueryTree } from './src/query/query-tree-builder';
import { distillQuery } from './src/graphql/query-distiller';
import { getAQLForQuery } from './src/database/arangodb/aql-generator';
import * as fs from 'fs';

const model = parse(fs.readFileSync('./model.graphqls', 'utf-8'));
const schema = buildASTSchema(model);
const query = parse(`query($name: String) { allUsers(filter:{name: $name, id: "123"}) { code: id, name, pets(filter:{species: Cat}) { species name birthYear } } }`);
console.log(print(query));
const op = distillQuery(query, schema, { name: 'Hans "Wurscht"'});
console.log(op.describe());
const queryTree = createQueryTree(op);
console.log(queryTree.describe());
const aql = getAQLForQuery(queryTree);
console.log(aql.toPrettyString());