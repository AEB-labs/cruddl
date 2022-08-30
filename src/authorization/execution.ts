import {
    AddEdgesQueryNode,
    ATOMICITY_SKIP_ERROR,
    CreateEntityQueryNode,
    DeleteEntitiesQueryNode,
    QueryNode,
    RemoveEdgesQueryNode,
    RuntimeErrorQueryNode,
    SetEdgeQueryNode,
    UpdateEntitiesQueryNode,
} from '../query-tree';
import { visitQueryNode } from '../query-tree/visitor';
import { AuthContext } from './auth-basics';
import { moveErrorsToOutputNodes } from './move-errors-to-output-nodes';
import { transformNode } from './transformers';

const MUTATIONS: Function[] = [
    CreateEntityQueryNode,
    UpdateEntitiesQueryNode,
    DeleteEntitiesQueryNode,
    AddEdgesQueryNode,
    RemoveEdgesQueryNode,
    SetEdgeQueryNode,
];

/**
 * Modifies a QueryTree so that it properly checks authorization for any access
 */
export function applyAuthorizationToQueryTree(
    queryTree: QueryNode,
    authContext: AuthContext,
): QueryNode {
    // applyTransformations
    // bubble up (so that errors *inside* mutations properly replace those mutations)
    // if any mutations AND any errors, replace all mutations by errors (so we don't execute partial mutations)
    // bubble up

    queryTree = applyTransformations(queryTree, authContext);
    queryTree = moveErrorsToOutputNodes(queryTree);
    if (containsErrorsAndMutations(queryTree)) {
        queryTree = replaceMutationsByErrors(queryTree);
        queryTree = moveErrorsToOutputNodes(queryTree);
    }

    return queryTree;
}

function applyTransformations(queryTree: QueryNode, authContext: AuthContext): QueryNode {
    return visitQueryNode(queryTree, {
        leave(node: QueryNode) {
            return transformNode(node, authContext);
        },
    });
}

function containsErrorsAndMutations(queryTree: QueryNode): boolean {
    let containsErrors = false;
    let containsMutations = false;
    visitQueryNode(queryTree, {
        enter(node: QueryNode) {
            if (node instanceof RuntimeErrorQueryNode) {
                containsErrors = true;
            } else if (MUTATIONS.includes(node.constructor)) {
                containsMutations = true;
            }
            if (containsMutations && containsErrors) {
                return { newValue: node, recurse: false };
            }
            return { newValue: node, recurse: true };
        },
    });
    return containsErrors && containsMutations;
}

function replaceMutationsByErrors(queryTree: QueryNode): QueryNode {
    return visitQueryNode(queryTree, {
        enter: function (node: QueryNode) {
            if (MUTATIONS.includes(node.constructor)) {
                return {
                    newValue: new RuntimeErrorQueryNode(
                        'Skipped because other mutations reported errors',
                        { code: ATOMICITY_SKIP_ERROR },
                    ),
                };
            }
            return { newValue: node };
        },
    });
}
