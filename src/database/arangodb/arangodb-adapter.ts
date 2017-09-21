import { DatabaseAdapter } from '../database-adapter';
import { QueryNode } from '../../query/definition';
import { getAQLForQuery } from './aql-generator';
import { Database } from 'arangojs';

export interface ArangoDBConfig {
    readonly url: string;
    readonly databaseName: string;
}

export class ArangoDBAdapter implements DatabaseAdapter {
    private db: Database;

    constructor(config: ArangoDBConfig) {
        this.db = new Database({
            url: config.url,
            databaseName: config.databaseName
        });
    }

    async execute(queryTree: QueryNode) {
        const aql = getAQLForQuery(queryTree);
        console.log(aql.toPrettyString());
        const cursor = await this.db.query(aql.code, aql.bindValues);
        return await cursor.next();
    }
}
