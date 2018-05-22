import { QueryNode } from '../query-tree';
import { Model } from '../model';

export interface DatabaseAdapter {
    /**
     * Executes a query
     */
    execute(queryTree: QueryNode): Promise<any>;

    /**
     * Performs schema migrations if necessary
     */
    updateSchema(schema: Model): Promise<void>;
}
