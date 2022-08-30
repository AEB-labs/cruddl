import { Database } from 'arangojs';
import { ERROR_QUERY_NOT_FOUND } from './error-codes';

interface CancellationManagerConfig {
    readonly database: Database;
}

export class CancellationManager {
    private readonly database: Database;

    constructor(config: CancellationManagerConfig) {
        this.database = config.database;
    }

    async cancelQuery(transactionID: string) {
        const queries = await this.database.listRunningQueries();
        const query = queries.find((q) => q.query.startsWith(`/*id:${transactionID}*/`));
        if (!query) {
            return;
        }
        try {
            await this.database.killQuery(query.id);
        } catch (e) {
            if (e.errorNum === ERROR_QUERY_NOT_FOUND) {
                // error has finished in the meantime, so ignore
                return;
            }
            throw e;
        }
    }
}
