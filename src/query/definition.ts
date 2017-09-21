/**
 *
 * This is kind of a query language definition, tailored for our use case. There is no string representation, but
 * the objects can "describe" themselves for a human-readable representation.
 *
 * A query tree specifies *what* is to be fetched and *how* the result should look like. Each query node results in
 * some kind of runtime value. For simplification, there are no arguments or variables. Instead, some nodes like
 * "access field" use the context object implicitly. This is in line with GraphQL and simplifies both query generation
 * and query consumption.
 *
 * To specify an expression like this:
 *     users.filter(u => u.role == "admin").map(u => { name: u.fullName, age: u.age })
 * create the following query:
 *  EntitiesQueryNode {
 *    type: 'User'
 *    filterNode: BinaryOperationQueryNode { # gets each user as context
 *      lhs: FieldNode "role" # takes the context for field access
 *      operator: EQUALS
 *      rhs: LiteralNode "admin"
 *    }
 *    innerNode: ObjectQueryNode { # gets each user as context
 *      property "name": FieldNode "fullName"
 *      property "age": FieldNode "age"
 *    }
 *
 *
 */
import { GraphQLField, GraphQLObjectType } from 'graphql';
import { indent } from '../utils/utils';

export interface QueryNode {
    describe(): string;
}

/**
 * A node that evaluates to the current context value
 */
export class ContextQueryNode implements QueryNode {
    constructor() {
    }

    public describe() {
        return `context`;
    }
}

/**
 * A node that evaluates to a predefined literal value
 */
export class LiteralQueryNode {
    constructor(public readonly value: any) {
    }

    public describe() {
        return `literal ${JSON.stringify(this.value).magenta}`;
    }
}

/**
 * A node that evaluates to the value of a regular field of the context object
 *
 * Note: this is unrelated to storing the value in a property of a result object, see ObjectQueryNode
 */
export class FieldQueryNode implements QueryNode {
    constructor(public readonly field: GraphQLField<any, any>) {
    }

    public describe() {
        return `field ${this.field.name.blue}`;
    }
}

/**
 * A node that evaluates in a JSON-like object structure with properties and values
 */
export class ObjectQueryNode implements QueryNode {
    constructor(public readonly properties: PropertySpecification[]) {

    }

    describe() {
        return `{\n` + indent(this.properties.map(p => p.describe()).join('\n')) + `\n}`;
    }
}

/**
 * Specifies one property of a an ObjectQueryNode
 */
export class PropertySpecification implements QueryNode {
    constructor(public readonly propertyName: string,
                public readonly valueNode: QueryNode) {

    }

    describe(): string {
        return `${JSON.stringify(this.propertyName).green}: ${this.valueNode.describe()}`;
    }
}

/**
 * A node that performs an operation with two operands
 */
export class BinaryOperationQueryNode implements QueryNode {
    constructor(public readonly lhs: QueryNode, public readonly operator: BinaryOperator, public readonly rhs: QueryNode) {

    }

    describe() {
        return `${this.lhs.describe()} ${this.describeOperator(this.operator)} ${this.rhs.describe()}`;
    }

    private describeOperator(op: BinaryOperator) {
        switch (op) {
            case BinaryOperator.AND:
                return '&&';
            case BinaryOperator.OR:
                return '&&';
            case BinaryOperator.EQUALS:
                return '==';
            default:
                return '(unknown operator)';
        }
    }
}

/**
 * The operator of a BinaryOperationQueryNode
 */
export enum BinaryOperator {
    AND,
    OR,
    EQUALS
}

/**
 * A node to fetch entities of a certain kind. Supports a wide range of options like filtering, sorting, pagination etc.
 */
export class EntitiesQueryNode implements QueryNode {
    constructor(params: { objectType: GraphQLObjectType, innerNode?: QueryNode, filterNode?: QueryNode }) {
        this.objectType = params.objectType;
        this.innerNode = params.innerNode || new ContextQueryNode();
        this.filterNode = params.filterNode || new LiteralQueryNode(true);
    }

    public readonly objectType: GraphQLObjectType;
    public readonly innerNode: QueryNode;
    public readonly filterNode: QueryNode;

    describe() {
        return `entities of type ${this.objectType.name.blue} where ${this.filterNode.describe()} as ${this.innerNode.describe()}`;
    }
}
