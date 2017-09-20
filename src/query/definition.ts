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
 *    filterNode: EqualsNode { # gets each user as context
 *      lhs: FieldNode "role" # takes the context for field access
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

export class LiteralQueryNode {
    constructor(public readonly literal: any) {
    }

    public describe() {
        return `literal ${JSON.stringify(this.literal)}`;
    }
}

/**
 * A node to access a regular field of the context object
 *
 * Note: this is unrelated to storing the value in a property of a result object, see ObjectQueryNode
 */
export class FieldQueryNode implements QueryNode {
    constructor(public readonly field: GraphQLField<any, any>) {
    }

    public describe() {
        return `field ${this.field.name}`;
    }
}

/**
 * A node to generate a regular object with properties of certain values
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
export class PropertySpecification {
    constructor(public readonly propertyName: string,
                public readonly valueNode: QueryNode) {

    }

    describe(): string {
        return `${JSON.stringify(this.propertyName)}: ${this.valueNode.describe()}`;
    }
}

/**
 * A node to fetch entities of a certain kind. Supports a wide range of options like filtering, sorting, pagination etc.
 */
export class EntitiesQueryNode implements QueryNode {
    /**
     * @param type the type of entities to fetch
     * @param innerNode a node that specifies how to fetch each object
     */
    constructor(public readonly type: GraphQLObjectType, public readonly innerNode: QueryNode) {
    }

    describe() {
        return `entities of type ${JSON.stringify(this.type.name)} as ${this.innerNode.describe()}`;
    }
}
