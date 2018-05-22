import { red } from 'colors/safe';
import { QueryNode } from './base';

/**
 * A node which can never evaluate to any value and thus prevents a query from being executed
 */
export class UnknownValueQueryNode extends QueryNode {
    public describe() {
        return `unknown`;
    }
}

/**
 * A node that evaluates to an error value but does not prevent the rest from the query tree from being evaluated
 */
export class RuntimeErrorQueryNode extends QueryNode {
    constructor(public readonly message: string) {
        super();
    }

    public describe() {
        return red(`error ${JSON.stringify(this.message)}`);
    }
}
