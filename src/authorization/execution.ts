import { EntitiesQueryNode, FieldQueryNode, QueryNode } from '../query/definition';
import { AuthContext } from './auth-basics';
import { VisitAction, visitObject } from '../utils/visitor';
import { transformEntitiesQueryNode } from './transformers/entities';
import { transformNode } from './transformers';
import { moveErrorsToOutputNodes } from './move-errors-to-output-nodes';

/**
 * Modifies a QueryTree so that it properly checks authorization for any access
 */
export function applyAuthorizationToQueryTree(queryTree: QueryNode, authContext: AuthContext): QueryNode {
    const intermediate = visitObject(queryTree, {
        enter(node: QueryNode) {
            if (!(node instanceof QueryNode)) {
                return VisitAction.SKIP_NODE;
            }
            return transformNode(node, authContext);
        }
    });
    return moveErrorsToOutputNodes(intermediate);
}
