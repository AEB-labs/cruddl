import { uniq } from 'lodash';
import { ConditionalQueryNode, FirstOfListQueryNode, ListQueryNode, ObjectQueryNode, PreExecQueryParms, PropertySpecification, QueryNode, FLEX_SEARCH_TOO_MANY_OBJECTS, RuntimeErrorQueryNode, TransformListQueryNode, VariableAssignmentQueryNode, WithPreExecutionQueryNode } from '../query-tree';
import { visitQueryNode } from '../query-tree/visitor';
import { VisitResult } from '../utils/visitor';

/**
 * Moves RuntimeErrorQueryNodes up to its their deepest ancestor that is an output node, i.e., its value directly occurs
 * as a value within the query result
 */
export function moveErrorsToOutputNodes(queryTree: QueryNode): QueryNode {
    let errorList: RuntimeErrorQueryNode[] = [];
    let minErrorDepth: number | undefined = undefined;
    type StackFrame = {
        clazz: Function,
        outputNodeKind: OutputNodeKind
    }
    const stack: StackFrame[] = [];

    return visitQueryNode(queryTree, {
        enter(node: QueryNode, key: string): VisitResult<QueryNode> {
            if (node instanceof RuntimeErrorQueryNode) {
                errorList.push(node);
                minErrorDepth = Math.min(minErrorDepth === undefined ? stack.length : minErrorDepth, stack.length);
            }
            if (!stack.length) {
                stack.push({
                    clazz: node.constructor,
                    outputNodeKind: OutputNodeKind.OUTPUT
                });
            } else {
                const parentFrame = stack[stack.length - 1];
                const kind = parentFrame.outputNodeKind != OutputNodeKind.INTERNAL ? outputNodes.getOutputKind(parentFrame.clazz, key) : OutputNodeKind.INTERNAL;
                stack.push({
                    clazz: node.constructor,
                    outputNodeKind: kind
                });
                if (errorList.length && kind === OutputNodeKind.OUTPUT) {
                    return { recurse: false, newValue: node };
                }
            }
            return { newValue: node };
        },

        leave(node: QueryNode) {
            const frame = stack.pop();
            // only take care of the errors if all of them occurred within this node
            if (errorList.length) {

                if (frame && frame.outputNodeKind == OutputNodeKind.OUTPUT && stack.length <= minErrorDepth!) {
                    let errors = errorList;
                    if (errors.some(value => value.code !== FLEX_SEARCH_TOO_MANY_OBJECTS)) {
                        errors = errors.filter(value => value.code !== FLEX_SEARCH_TOO_MANY_OBJECTS);
                    }
                    errorList = [];
                    minErrorDepth = undefined;
                    if (errors.length == 1) {
                        return errors[0];
                    } else {
                        let uniqueErrorMessages = uniq(errors.map(err => err.message));
                        const code = errors.some(value => value.code !== errors[0].code) ? undefined : errors[0].code;
                        return new RuntimeErrorQueryNode(uniqueErrorMessages.join(', '), { code });
                    }
                } else {
                    // before entering the next sibling, make sure that the next sibling won't take care of these errors, because they now belong to the parent
                    minErrorDepth = Math.min(minErrorDepth!, stack.length - 1);
                }
            }
            return node;
        }
    });
}

export enum OutputNodeKind {
    /**
     * The value of these kind of nodes and its children is not directly visible in the output (like filters)
     */
    INTERNAL,

    /**
     * The value of these kind of nodes is directly visible in the output
     */

    OUTPUT,
    /**
     * The value of these kind of nodes are not directly visible, buts the value of its children may be
     */

    OUTPUT_INTERMEDIATE
}


namespace outputNodes {
    const map = new Map<Function, Map<string, OutputNodeKind>>();

    function add<T>(clazz: { new(...a: any[]): T }, ...fields: ((keyof T) & string)[]) {
        addExt(clazz, OutputNodeKind.OUTPUT, ...fields);
    }

    function addExt<T>(clazz: { new(...a: any[]): T }, kind: OutputNodeKind, ...fields: ((keyof T) & string)[]) {
        map.set(clazz, new Map(fields.map((field): [string, OutputNodeKind] => ([field, kind]))));
    }

    /**
     * Determines if a field of a node is an output value, assuming the parent node is an output value, too
     *
     * For example, the valueNode of a propertySpecification is an output node, while the filterNode of a list
     * transformation is not
     *
     * @param clazz the class of the parent node
     * @param fieldName the field name of the node to check within its parent class
     * @returns true, if the child node is an output node, false otherwise
     */
    export function getOutputKind(clazz: Function, fieldName: string): OutputNodeKind {
        const set = map.get(clazz);
        if (!set) {
            return OutputNodeKind.INTERNAL;
        }
        return set.get(fieldName) || OutputNodeKind.INTERNAL;
    }

    add(VariableAssignmentQueryNode, 'resultNode');
    addExt(ObjectQueryNode, OutputNodeKind.OUTPUT_INTERMEDIATE, 'properties');
    add(PropertySpecification, 'valueNode');
    add(ListQueryNode, 'itemNodes');
    add(ConditionalQueryNode, 'expr1', 'expr2');
    add(TransformListQueryNode, 'innerNode');
    addExt(WithPreExecutionQueryNode, OutputNodeKind.OUTPUT_INTERMEDIATE, 'resultNode', 'preExecQueries');
    addExt(PreExecQueryParms, OutputNodeKind.OUTPUT_INTERMEDIATE, 'query');

    // this one with a grain of salt... errors in any item that is not the first will get ignored
    // but we need this for single-entity queries to work properly
    addExt(FirstOfListQueryNode, OutputNodeKind.OUTPUT_INTERMEDIATE, 'listNode');
}
