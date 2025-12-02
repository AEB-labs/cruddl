import { magenta } from '../utils/colors';
import { indent } from '../utils/utils';
import { QueryNode } from './base';

namespace varIndices {
    let nextIndex = 1;

    export function next() {
        const thisIndex = nextIndex;
        nextIndex++;
        return thisIndex;
    }
}

/**
 * A node that evaluates to the value of a variable.
 *
 * Use in a VariableAssignmentQueryNode or in a TransformListQueryNode to assign a value
 */
export class VariableQueryNode extends QueryNode {
    constructor(public readonly label?: string) {
        super();
        this.index = varIndices.next();
    }

    public readonly index: number;

    equals(other: this) {
        // use reference equality because VariableQueryNodes are used as tokens, the label is only informational
        return other === this;
    }

    toString() {
        return `$${this.label || 'var'}_${this.index}`;
    }

    describe() {
        return magenta(this.toString());
    }
}

/**
 * A node that sets the value of a variable to the result of a node and evaluates to a second node
 *
 * LET $variableNode = $variableValueNode RETURN $resultNode
 *
 * (function() {
 *   let $variableNode = $variableValueNode
 *   return $resultNode
 * })()
 */
export class VariableAssignmentQueryNode extends QueryNode {
    constructor(params: {
        variableValueNode: QueryNode;
        resultNode: QueryNode;
        variableNode: VariableQueryNode;
    }) {
        super();
        this.variableNode = params.variableNode;
        this.variableValueNode = params.variableValueNode;
        this.resultNode = params.resultNode;
    }

    static create(
        valueNode: QueryNode,
        resultNodeFn: (variableNode: QueryNode) => QueryNode,
        varLabel?: string,
    ) {
        const variableNode = new VariableQueryNode(varLabel);
        return new VariableAssignmentQueryNode({
            variableNode,
            variableValueNode: valueNode,
            resultNode: resultNodeFn(variableNode),
        });
    }

    public readonly variableValueNode: QueryNode;
    public readonly resultNode: QueryNode;
    public readonly variableNode: VariableQueryNode;

    public describe() {
        return `let ${this.variableNode.describe()} = (\n${indent(
            this.variableValueNode.describe(),
        )}\n) in (\n${indent(this.resultNode.describe())}\n)`;
    }
}

/**
 * A wrapper around an expression that should be hoisted out of certain contexts
 *
 * This is a simpler version of a variable assignment (which is also hoistable) but does not require
 * a variable. For this reason, it cannot be used if the expression is used multiple times.
 */
export class HoistableQueryNode extends QueryNode {
    constructor(
        public readonly node: QueryNode,
        /**
         * The name of the variable this node would be assigned to when hoisted
         */
        public readonly variableLabel: string,
    ) {
        super();
    }

    public describe() {
        return `hoistable as ${this.variableLabel} (\n${indent(this.node.describe())}\n)`;
    }
}
