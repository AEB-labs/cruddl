import type { QueryNode } from '../base.js';
import { VariableQueryNode } from '../variables.js';
import { visitQueryNode } from '../visitor.js';

export function getReferencedVariables(node: QueryNode): ReadonlySet<VariableQueryNode> {
    const referenced = new Set<VariableQueryNode>();
    visitQueryNode(node, {
        enter(current) {
            if (current instanceof VariableQueryNode) {
                referenced.add(current);
            }
            return { newValue: current };
        },
    });
    return referenced;
}
