import {
    AddEdgesQueryNode,
    CreateEntityQueryNode, DeleteEntitiesQueryNode, QueryNode, RemoveEdgesQueryNode, RuntimeErrorQueryNode,
    SetEdgeQueryNode,
    UpdateEntitiesQueryNode
} from '../query/definition';
import { AuthContext } from './auth-basics';
import { VisitAction, visitObject } from '../utils/visitor';
import { transformNode } from './transformers';
import { moveErrorsToOutputNodes } from './move-errors-to-output-nodes';
import { visitQueryNode } from '../query/query-visitor';

const MUTATIONS: Function[] = [ CreateEntityQueryNode, UpdateEntitiesQueryNode, DeleteEntitiesQueryNode, AddEdgesQueryNode, RemoveEdgesQueryNode, SetEdgeQueryNode ];

/**
 * Modifies a QueryTree so that it properly checks authorization for any access
 */
export function applyAuthorizationToQueryTree(queryTree: QueryNode, authContext: AuthContext): QueryNode {
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
        enter(node: QueryNode) {
            return transformNode(node, authContext);
        }
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
                return VisitAction.SKIP_NODE;
            }
            return node;
        }
    });
    return containsErrors && containsMutations;
}

function replaceMutationsByErrors(queryTree: QueryNode): QueryNode {
    return visitQueryNode(queryTree, {
        enter(node: QueryNode) {
            if (MUTATIONS.includes(node.constructor)) {
                return new RuntimeErrorQueryNode("SkipError: Skipped because other mutations reported errors")
            }
            return node;
        }
    });
}
