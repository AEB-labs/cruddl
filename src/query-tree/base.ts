/**
 * A node in an expression tree to be evaluated in a data base
 *
 * This is kind of a query language definition, tailored for our use case. There is no string representation, but
 * the objects can "describe" themselves for a human-readable representation.
 *
 * A query tree specifies *what* is to be fetched and *how* the result should look like. Each query node results in
 * some kind of runtime value. A *variable node* is a special node that can be passed to some other nodes which then
 * *assign* this variable. Wherever it is used as a normal node, it evaluates to the current value of the variable. This
 * is mostly used for loop variables.
 *
 * To specify an expression like this:
 *     users.filter(u => u.role == "admin").map(u => { name: u.fullName, age: u.age })
 * create the following query:
 *  EntitiesQueryNode {
 *    type: 'User'
 *    itemVar: $itemVar
 *    filterNode: BinaryOperationQueryNode {
 *      lhs: FieldNode {
 *        field "role"
 *        object $itemVar
 *      }
 *      operator: EQUALS
 *      rhs: LiteralNode "admin"
 *    }
 *    innerNode: ObjectQueryNode {
 *      property "name": FieldNode {
 *        field "fullName"
 *        object $itemVar
 *      }
 *      property "age": FieldNode {
 *        field "age"
 *        object $itemVar
 *      }
 *    }
 *
 * Classes should extend QueryNode if they are considered part of the query tree. Instances of QueryNode can be visited
 * by visitQueryNode and they can be structurally compared with `equals`.
 */
export abstract class QueryNode {
    abstract describe(): string;

    public equals(other: this) {
        if (!other || other.constructor !== this.constructor) {
            return false;
        }
        return Object.keys(this).every(key => this.fieldEquals(key, (this as any)[key], (other as any)[key]));
    }

    protected fieldEquals(key: string, lhs: any, rhs: any): boolean {
        if (lhs instanceof QueryNode && rhs instanceof QueryNode) {
            return lhs.equals(rhs);
        }
        return lhs === rhs;
    }


}
