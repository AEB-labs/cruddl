import type { FieldOrigin, QueryTreeVariableOrigins } from '../core/database/database-adapter.js';
import type { AQLExecutableQuery } from './aql.js';

/**
 * Maps the AQL variable names of a transaction step to the GraphQL fields they originate from
 */
export function getVariableOrigins(
    query: AQLExecutableQuery,
    queryTreeVariableOrigins: QueryTreeVariableOrigins | undefined,
): { readonly [aqlVariableName: string]: FieldOrigin } | undefined {
    if (!queryTreeVariableOrigins || !query.queryTreeVariableIndices) {
        return undefined;
    }
    const result: { [aqlVariableName: string]: FieldOrigin } = {};
    for (const [variableName, index] of Object.entries(query.queryTreeVariableIndices)) {
        const origin = queryTreeVariableOrigins.getOrigin(index);
        if (origin) {
            result[variableName] = origin;
        }
    }
    return result;
}
