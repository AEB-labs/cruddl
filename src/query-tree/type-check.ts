import { QueryNode } from './base';

/**
 * A query that evaluates to true if a value is of a certain type, or false otherwise
 */
export class TypeCheckQueryNode extends QueryNode {
    constructor(
        public readonly valueNode: QueryNode,
        public type: BasicType,
    ) {
        super();
    }

    private describeType(type: BasicType) {
        switch (type) {
            case BasicType.OBJECT:
                return 'object';
            case BasicType.LIST:
                return 'list';
            case BasicType.SCALAR:
                return 'scalar';
            case BasicType.NULL:
                return 'null';
        }
    }

    describe(): string {
        return `(${this.valueNode.describe()} is of type ${this.describeType(this.type)})`;
    }
}

export enum BasicType {
    OBJECT,
    LIST,
    SCALAR,

    /**
     * The single NULL type (note that there is nothing like undefined - missing properties should evaluate to NULL)
     */
    NULL,
}

/**
 * A query node that evaluates to node if it's a list, or to an empty list if it's not
 *
 * This could be reduced to a conditional node and a TypeCheck node, but it eases database-specific optimizations
 */
export class SafeListQueryNode extends QueryNode {
    constructor(public readonly sourceNode: QueryNode) {
        super();
    }

    describe(): string {
        return `(${this.sourceNode.describe()} or [] if not a list)`;
    }
}
