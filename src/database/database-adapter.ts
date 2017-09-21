import { QueryNode } from '../query/definition';

export interface DatabaseAdapter {
    execute(queryTree: QueryNode): Promise<any>;
}
