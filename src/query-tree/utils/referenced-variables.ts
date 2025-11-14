import { QueryNode } from '../base';
import { VariableQueryNode } from '../variables';
import { visitQueryNode } from '../visitor';

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
