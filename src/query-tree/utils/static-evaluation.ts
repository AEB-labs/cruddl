import type { QueryNode } from '../base.js';
import { ObjectQueryNode } from '../objects.js';

export interface StaticEvaluationResult {
    canEvaluateStatically: boolean;
    result?: any;
}

export function evaluateQueryStatically(queryNode: QueryNode): StaticEvaluationResult {
    if (queryNode instanceof ObjectQueryNode && queryNode.properties.length == 0) {
        return {
            canEvaluateStatically: true,
            result: {},
        };
    }
    return {
        canEvaluateStatically: false,
    };
}
