import { QueryNode } from './base';
import { green } from '../utils/colors';
import { indent } from '../utils/utils';

/**
 * A node that evaluates in a JSON-like object structure with properties and values
 */
export class ObjectQueryNode extends QueryNode {
    constructor(public readonly properties: ReadonlyArray<PropertySpecification>) {
        super();
    }

    /**
     * An empty object
     */
    static EMPTY = new ObjectQueryNode([]);

    describe() {
        if (!this.properties.length) {
            return `{}`;
        }
        return `{\n` + indent(this.properties.map(p => p.describe()).join('\n')) + `\n}`;
    }
}

/**
 * Specifies one property of a an ObjectQueryNode
 */
export class PropertySpecification extends QueryNode {
    constructor(public readonly propertyName: string, public readonly valueNode: QueryNode) {
        super();
    }

    describe(): string {
        return `${green(JSON.stringify(this.propertyName))}: ${this.valueNode.describe()}`;
    }
}

/**
 * A node that that merges the properties of multiple nodes. If multiple objects define the same property, the last one
 * will win. Set properties to null to remove them.
 *
 * This operation behaves like the {...objectSpread} operator in JavaScript, or the MERGE function in AQL.
 *
 * The merge is NOT recursive.
 */
export class MergeObjectsQueryNode extends QueryNode {
    constructor(public readonly objectNodes: ReadonlyArray<QueryNode>) {
        super();
    }

    describe() {
        return `{\n` + indent(this.objectNodes.map(node => '...' + node.describe()).join(',\n')) + '\n}';
    }
}

/**
 * A node that evaluates to the entries of all properties of an object (each as a two-item list with key and value)
 */
export class ObjectEntriesQueryNode extends QueryNode {
    constructor(public readonly objectNode: QueryNode) {
        super();
    }

    describe() {
        return `entries(${this.objectNode.describe()})`;
    }
}
