/**
 *
 * This is kind of a query language definition, tailored for our use case. There is no string representation, but
 * the objects can "describe" themselves for a human-readable representation.
 *
 * A query tree specifies *what* is to be fetched and *how* the result should look like. Each query node results in
 * some kind of runtime value. Some nodes are evaluated with a *context value* which is then transitively passed through
 * the tree until a different context value is present. The context value can then be retrieved via ContextNode. This is
 * used for loop variables. It could also be used for any object (e.g. a ContextEstablishingQueryNode), but here, we
 * currently just repeat the node that evaluates to this object on every use.
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
import { TypeSpecification } from '../../../model-manager-node/src/definition/types';

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
 * A node that sets the context to the result of a node and evaluates to a second node
 */
export class ContextAssignmentQueryNode implements QueryNode {
    constructor(public readonly contextValueNode: QueryNode, public readonly resultNode: QueryNode) {
    }

    public describe() {
        return `let context = ${this.contextValueNode.describe()} in ${this.resultNode.describe()}`;
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
 * A node that evaluates to the value of a field of an object
 *
 * Note: this is unrelated to storing the value in a property of a result object, see ObjectQueryNode
 */
export class FieldQueryNode implements QueryNode {
    constructor(public readonly objectNode: QueryNode, public readonly field: GraphQLField<any, any>) {
    }

    public describe() {
        return `field ${this.field.name.blue} of ${this.objectNode.describe()}`;
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
 * A query that evaluates to true if a value is of a certain type, or false otherwise
 */
export class TypeCheckQueryNode implements QueryNode {
    constructor(public readonly valueNode: QueryNode, public type: BasicType) {

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
        return `${this.valueNode.describe()} is of type ${this.describeType(this.type)}`;
    }
}

export enum BasicType {
    OBJECT,
    LIST,
    SCALAR,
    NULL
}

export class ConditionalQueryNode implements QueryNode{
    constructor(public readonly condition: QueryNode, public readonly expr1: QueryNode, public readonly expr2: QueryNode) {

    }

    describe() {
        return `${this.condition.describe()} ? ${this.expr1.describe()} : ${this.expr2.describe()}`;
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
 * A node that evaluates in the list of entities of a given type. use ListQueryNode to further process them
 */
export class EntitiesQueryNode implements QueryNode {
    constructor(public readonly objectType: GraphQLObjectType) { }

    describe() {
        return `entities of type ${this.objectType.name.blue}`;
    }
}

/**
 * A node to to control how to retrieve an embedded list
 */
export class ListQueryNode implements QueryNode {
    constructor(params: { listNode: QueryNode, innerNode?: QueryNode, filterNode?: QueryNode, orderBy?: OrderSpecification, maxCount?: number }) {
        this.listNode = params.listNode;
        this.innerNode = params.innerNode || new ContextQueryNode();
        this.filterNode = params.filterNode || new LiteralQueryNode(true);
        this.orderBy = params.orderBy || new OrderSpecification([]);
        this.maxCount = params.maxCount;
    }

    public readonly listNode: QueryNode;
    public readonly innerNode: QueryNode;
    public readonly filterNode: QueryNode;
    public readonly orderBy: OrderSpecification;
    public readonly maxCount: number|undefined;

    describe() {
        return `${this.listNode.describe()} as list where ${this.filterNode.describe()} order by${this.orderBy.describe()} ${this.maxCount != undefined ? ` (max ${this.maxCount}` : ''} as ${this.innerNode.describe()}`;
    }
}

export class OrderClause {
    constructor(public readonly valueNode: QueryNode, public readonly direction: OrderDirection) {

    }

    private describeDirection(direction: OrderDirection) {
        if (direction == OrderDirection.DESCENDING) {
            return ` desc`;
        }
        return ``;
    }

    describe() {
        return `${this.valueNode.describe()}${this.describeDirection(this.direction)}`;
    }
}

export class OrderSpecification {
    constructor(public readonly clauses: OrderClause[]) {

    }

    isUnordered() {
        return this.clauses.length == 0;
    }

    describe() {
        if (!this.clauses.length) {
            return '(unordered)';
        }
        return this.clauses.map(c => c.describe()).join(', ');
    }
}

export enum OrderDirection {
    ASCENDING,
    DESCENDING
}

/**
 * A node that creates a new entity and evaluates to that new entity object
 */
export class CreateEntityQueryNode {
    constructor(public readonly objectType: GraphQLObjectType, public readonly objectNode: QueryNode) {

    }

    describe() {
        return `create ${this.objectType.name} entity with values ${this.objectNode.describe()}`;
    }
}
