import { ObjectQueryNode, QueryNode } from '..';

export interface StaticEvaluationResult {
    canEvaluateStatically: boolean
    result?: any
}

export function evaluateQueryStatically(queryNode: QueryNode): StaticEvaluationResult {
    if (queryNode instanceof ObjectQueryNode && queryNode.properties.length == 0) {
        return {
            canEvaluateStatically: true,
            result: {}
        };
    }
    return {
        canEvaluateStatically: false
    }
}
