import { QueryNode } from './base';
import { VariableQueryNode } from './variables';

export type Quantifier = 'some' | 'every' | 'none';

/**
 * A boolean node that determines if a condition applies to some/none/every item of a list
 *
 * This could be reduced via filtering and counting, but having this node enables database-specific optimizations.
 */
export class QuantifierFilterNode extends QueryNode {
    public readonly listNode: QueryNode;
    public readonly itemVariable: VariableQueryNode;
    public readonly conditionNode: QueryNode;
    public readonly quantifier: Quantifier;

    constructor(
        config: {
            readonly listNode: QueryNode
            readonly itemVariable: VariableQueryNode
            readonly conditionNode: QueryNode
            readonly quantifier: Quantifier
        }
    ) {
        super();
        this.listNode = config.listNode;
        this.itemVariable = config.itemVariable;
        this.conditionNode = config.conditionNode;
        this.quantifier = config.quantifier;
    }

    describe(): string {
        return `${this.quantifier} of ${this.listNode.describe()} matches (${this.itemVariable.describe()} => ${this.conditionNode.describe()})`;
    }
}
