import { cyan } from 'colors/safe';
import { QueryNode } from './base';

/**
 * A node that evaluates to a predefined literal value
 */
export class LiteralQueryNode extends QueryNode {
    constructor(public readonly value: any) {
        super();
    }

    equals(other: this) {
        // Consider LiteralQueryNodes as tokens - we might later decide to put the "value" behind a getter function
        return other === this;
    }

    public describe() {
        const json = this.value === undefined ? 'undefined' : JSON.stringify(this.value);
        return `literal ${cyan(json)}`;
    }
}

/**
 * A node that evaluates either to null
 */
export class NullQueryNode extends QueryNode {
    public describe() {
        return `null`;
    }

    static readonly NULL = new NullQueryNode();
}

/**
 * A node that evaluates either to true or to false
 */
export class ConstBoolQueryNode extends QueryNode {
    constructor(public readonly value: boolean) {
        super();
    }

    static readonly TRUE = new ConstBoolQueryNode(true);
    static readonly FALSE = new ConstBoolQueryNode(false);

    static for(value: boolean) {
        return value ? this.TRUE : this.FALSE;
    }

    public describe() {
        return `${!!this.value}`;
    }
}

/**
 * A node that evaluates to a constant integer
 */
export class ConstIntQueryNode extends QueryNode {
    constructor(public readonly value: number) {
        super();
        if (!Number.isSafeInteger(value)) {
            throw new Error(`Invalid integer: ${value}`);
        }
    }

    static readonly ZERO = new ConstIntQueryNode(0);
    static readonly ONE = new ConstIntQueryNode(1);

    public describe() {
        return `${this.value}`;
    }
}
