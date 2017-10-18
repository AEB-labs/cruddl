/**
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
 *
 */
import { GraphQLField, GraphQLObjectType } from 'graphql';
import { indent } from '../utils/utils';
import { EdgeType } from '../schema/edges';

export interface QueryNode {
    describe(): string;
}

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
export class VariableQueryNode implements QueryNode {
    constructor(public readonly label?: string) {
        this.index = varIndices.next();
    }

    public readonly index: number;

    toString() {
        return `$${this.label || 'var'}_${this.index}`;
    }

    describe() {
        return (this.toString()).magenta;
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
export class VariableAssignmentQueryNode implements QueryNode {
    constructor(params: { variableValueNode: QueryNode, resultNode: QueryNode, variableNode: VariableQueryNode }) {
        this.variableNode = params.variableNode;
        this.variableValueNode = params.variableValueNode;
        this.resultNode = params.resultNode;
    }

    static create(valueNode: QueryNode, resultNodeFn: (variableNode: QueryNode) => QueryNode, varLabel?: string) {
        const variableNode = new VariableQueryNode(varLabel);
        return new VariableAssignmentQueryNode({
            variableNode,
            variableValueNode: valueNode,
            resultNode: resultNodeFn(variableNode)
        })
    }

    public readonly variableValueNode: QueryNode;
    public readonly resultNode: QueryNode;
    public readonly variableNode: VariableQueryNode;

    public describe() {
        return `let ${this.variableNode} = ${this.variableValueNode.describe()} in ${this.resultNode.describe()}`;
    }
}

/**
 * A node that evaluates to a predefined literal value
 */
export class LiteralQueryNode {
    constructor(public readonly value: any) {
    }

    public describe() {
        const json = this.value === undefined ? 'undefined' : JSON.stringify(this.value);
        return `literal ${json.magenta}`;
    }
}

/**
 * A node that evaluates either to null
 */
export class NullQueryNode {
    public describe() {
        return `null`;
    }
}

/**
 * A node that evaluates either to true or to false
 */
export class ConstBoolQueryNode {
    constructor(public readonly value: boolean) {
    }

    public describe() {
        return `${!!this.value}`;
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
        return `${this.objectNode.describe()}.${this.field.name.blue}`;
    }
}

/**
 * A node that evaluates to the id of a root entity
 */
export class RootEntityIDQueryNode implements QueryNode {
    constructor(public readonly objectNode: QueryNode) {
    }

    public describe() {
        return `id(${this.objectNode.describe()})`;
    }
}

/**
 * A node that evaluates in a JSON-like object structure with properties and values
 */
export class ObjectQueryNode implements QueryNode {
    constructor(public readonly properties: PropertySpecification[]) {

    }

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
export class PropertySpecification implements QueryNode {
    constructor(public readonly propertyName: string,
                public readonly valueNode: QueryNode) {

    }

    describe(): string {
        return `${JSON.stringify(this.propertyName).green}: ${this.valueNode.describe()}`;
    }
}

/**
 * A node that evaluates to a list with query nodes as list entries
 */
export class ListQueryNode implements QueryNode {
    constructor(public readonly itemNodes: QueryNode[]) {

    }

    describe(): string {
        if (!this.itemNodes.length) {
            return `[]`;
        }
        return `[\n` + indent(this.itemNodes.map(item => item.describe()).join(',\n')) + `\n]`;
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
        return `(${this.valueNode.describe()} is of type ${this.describeType(this.type)})`;
    }
}

export enum BasicType {
    OBJECT,
    LIST,
    SCALAR,
    NULL
}

export class ConditionalQueryNode implements QueryNode {
    constructor(public readonly condition: QueryNode, public readonly expr1: QueryNode, public readonly expr2: QueryNode) {

    }

    describe() {
        return `(if ${this.condition.describe()} then ${this.expr1.describe()} else ${this.expr2.describe()} endif)`;
    }
}

/**
 * A node that performs an operation with one operand
 */
export class UnaryOperationQueryNode implements QueryNode {
    constructor(public readonly valueNode: QueryNode, public readonly operator: UnaryOperator) {

    }

    describe() {
        switch (this.operator) {
            case UnaryOperator.NOT:
                return `!(${this.valueNode.describe()})`;
            case UnaryOperator.JSON_STRINGIFY:
                return `JSON_STRINGIFY(${this.valueNode.describe()})`;
            default:
                return '(unknown operator)';
        }
    }
}

/**
 * The operator of a UnaryOperationQueryNode
 */
export enum UnaryOperator {
    NOT,
    JSON_STRINGIFY
}

/**
 * A node that performs an operation with two operands
 */
export class BinaryOperationQueryNode implements QueryNode {
    constructor(public readonly lhs: QueryNode, public readonly operator: BinaryOperator, public readonly rhs: QueryNode) {

    }

    describe() {
        return `(${this.lhs.describe()} ${this.describeOperator(this.operator)} ${this.rhs.describe()})`;
    }

    private describeOperator(op: BinaryOperator) {
        switch (op) {
            case BinaryOperator.AND:
                return '&&';
            case BinaryOperator.OR:
                return '&&';
            case BinaryOperator.EQUAL:
                return '==';
            case BinaryOperator.UNEQUAL:
                return '!=';
            case BinaryOperator.GREATER_THAN:
                return '>';
            case BinaryOperator.GREATER_THAN_OR_EQUAL:
                return '>=';
            case BinaryOperator.LESS_THAN:
                return '<';
            case BinaryOperator.LESS_THAN_OR_EQUAL:
                return '<=';
            case BinaryOperator.IN:
                return 'IN';
            case BinaryOperator.CONTAINS:
                return 'CONTAINS';
            case BinaryOperator.STARTS_WITH:
                return 'STARTS WITH';
            case BinaryOperator.ENDS_WITH:
                return 'ENDS WITH';
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
    EQUAL,
    UNEQUAL,
    LESS_THAN,
    LESS_THAN_OR_EQUAL,
    GREATER_THAN,
    GREATER_THAN_OR_EQUAL,
    IN,
    CONTAINS,
    STARTS_WITH,
    ENDS_WITH,
}

/**
 * A node that evaluates in the list of entities of a given type. use ListQueryNode to further process them
 */
export class EntitiesQueryNode implements QueryNode {
    constructor(public readonly objectType: GraphQLObjectType) {
    }

    describe() {
        return `entities of type ${this.objectType.name.blue}`;
    }
}

/**
 * A node to filter, order, limit and map a list
 *
 * itemVariable can be used inside filterNode and innerNode to access the current item
 */
export class TransformListQueryNode implements QueryNode {
    constructor(params: {
        listNode: QueryNode,
        innerNode?: QueryNode,
        filterNode?: QueryNode,
        orderBy?: OrderSpecification,
        maxCount?: number
        itemVariable?: VariableQueryNode
    }) {
        this.itemVariable = params.itemVariable || new VariableQueryNode();
        this.listNode = params.listNode;
        this.innerNode = params.innerNode || this.itemVariable;
        this.filterNode = params.filterNode || new ConstBoolQueryNode(true);
        this.orderBy = params.orderBy || new OrderSpecification([]);
        this.maxCount = params.maxCount;
    }

    public readonly listNode: QueryNode;
    public readonly innerNode: QueryNode;
    public readonly filterNode: QueryNode;
    public readonly orderBy: OrderSpecification;
    public readonly maxCount: number | undefined;
    public readonly itemVariable: VariableQueryNode;

    describe() {
        return `${this.listNode.describe()} as list\n` +
            indent(`where ${this.filterNode.describe()}\norder by ${this.orderBy.describe()}${this.maxCount != undefined ? `\nlimit ${this.maxCount}` : ''}\nas ${this.innerNode.describe()}`);
    }
}

export class CountQueryNode implements QueryNode {
    constructor(public readonly listNode: QueryNode) {

    }

    describe() {
        return `count(${this.listNode.describe()})`;
    }
}

/**
 * A node that evaluates to the first item of a list
 */
export class FirstOfListQueryNode implements QueryNode {
    constructor(public readonly listNode: QueryNode) {
    }

    describe() {
        return `first of ${this.listNode.describe()}`;
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
export class MergeObjectsQueryNode implements QueryNode {
    constructor(public readonly objectNodes: QueryNode[]) {

    }

    describe() {
        return `{\n` +
            indent(this.objectNodes.map(node => '...' + node.describe()).join(',\n')) +
            '\n}';
    }
}

/**
 * A node that concatenates multiple lists and evaluates to the new list
 *
 * This can be used to append items to an array by using a ListQueryNode as second item
 */
export class ConcatListsQueryNode implements QueryNode {
    constructor(public readonly listNodes: QueryNode[]) {

    }

    describe() {
        if (!this.listNodes.length) {
            return `[]`;
        }
        return `[\n` +
            this.listNodes.map(node => indent('...' + node.describe())).join(',\n') +
            `]`;
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
 * Evaluates to all root entitites that are connected to a specific root entitity through a specific edge
 */
export class FollowEdgeQueryNode implements QueryNode {
    constructor(readonly edgeType: EdgeType, readonly sourceEntityNode: QueryNode) {

    }

    describe() {
        return `follow ${this.edgeType} of ${this.sourceEntityNode.describe()}`
    }
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

/**
 * A node that updates existing entities
 *
 * Existing properties of the entities will be kept when not specified in the updateNode. If a property is specified
 * in updates and in the existing entity, it will be replaced with the PropertySpecification's value. To access the old
 * value of the entity within the updates, specify an oldValueVariable and use that inside the updates. Then, you can
 * access the old value of a field via a FieldQueryNode and use e.g. an UpdateObjectQueryNode to only modify some properties.
 *
 * FOR doc
 * IN $collection(objectType)
 * FILTER $filterNode
 * UPDATE doc
 * WITH $updateNode
 * IN $collection(objectType)
 * OPTIONS { mergeObjects: false }
 */
export class UpdateEntitiesQueryNode {
    constructor(params: {
        objectType: GraphQLObjectType,
        filterNode: QueryNode,
        updates: PropertySpecification[],
        maxCount?: number,
        currentEntityVariable?: VariableQueryNode
    }) {
        this.objectType = params.objectType;
        this.filterNode = params.filterNode;
        this.updates = params.updates;
        this.maxCount = params.maxCount;
        this.currentEntityVariable = params.currentEntityVariable || new VariableQueryNode();
    }

    public readonly objectType: GraphQLObjectType;
    public readonly filterNode: QueryNode;
    public readonly updates: PropertySpecification[];
    public readonly maxCount: number | undefined;
    public readonly currentEntityVariable: VariableQueryNode;

    describe() {
        return `update ${this.objectType.name} entities ` +
            `where (${this.currentEntityVariable.describe()} => ${this.filterNode.describe()}) ` +
            `with values (${this.currentEntityVariable.describe()} => {\n` +
            indent(this.updates.map(p => p.describe()).join(',\n')) +
            `\n})`;
    }
}

/**
 * A node that deletes existing entities and evaluates to the entities before deletion
 */
export class DeleteEntitiesQueryNode implements QueryNode {
    constructor(params: {
        objectType: GraphQLObjectType,
        filterNode: QueryNode,
        maxCount?: number,
        currentEntityVariable?: VariableQueryNode
    }) {
        this.objectType = params.objectType;
        this.filterNode = params.filterNode;
        this.maxCount = params.maxCount;
        this.currentEntityVariable = params.currentEntityVariable || new VariableQueryNode();
    }

    public readonly objectType: GraphQLObjectType;
    public readonly filterNode: QueryNode;
    public readonly maxCount: number | undefined;
    public readonly currentEntityVariable: VariableQueryNode;

    describe() {
        return `delete ${this.objectType.name} entities where (${this.currentEntityVariable.describe()} => ${this.filterNode.describe()})`;
    }
}

export class AddEdgesQueryNode implements QueryNode {

    // TODO: accept one QueryNode which evaluates to the lits of edge ids somehow?
    // (currently, adding 50 edges generates 50 bound variables with the literal values)

    constructor(readonly edgeType: EdgeType, readonly edges: EdgeIdentifier[]) {
    }

    describe() {
        return `add edges to ${this.edgeType}: [\n` +
            indent(this.edges.map(edge => edge.describe()).join(',\n')) +
            `\n]`;
    }
}

export class RemoveEdgesQueryNode implements QueryNode {
    constructor(readonly edgeType: EdgeType, readonly edgeFilter: EdgeFilter) {
    }

    describe() {
        return `remove edges from ${this.edgeType} matching ${this.edgeFilter.describe()}`;
    }
}

/**
 * Checks if an edge specified by existingEdgeFilter exists. If it does, replaces it by the newEdge. If it does not,
 * creates newEge.
 */
export class SetEdgeQueryNode implements QueryNode {
    constructor(params: { edgeType: EdgeType, existingEdgeFilter: PartialEdgeIdentifier, newEdge: EdgeIdentifier }) {
        this.edgeType = params.edgeType;
        this.existingEdge = params.existingEdgeFilter;
        this.newEdge = params.newEdge;
    }

    readonly edgeType: EdgeType;
    readonly existingEdge: PartialEdgeIdentifier;
    readonly newEdge: EdgeIdentifier;

    describe() {
        return `replace edge ${this.existingEdge.describe()} by ${this.newEdge.describe()} in ${this.edgeType}`;
    }
}

/**
 * Filters edges by from and to id (from and to are and-combined, but the individual ids are or-combined)
 *
 * pseudo code: from IN [...fromIDNodes] && to IN [...toIDNodes]
 */
export class EdgeFilter {
    constructor(readonly fromIDNodes?: QueryNode[], readonly toIDNodes?: QueryNode[]) {

    }

    describe() {
        return `(${this.describeIDs(this.fromIDNodes)} -> ${this.describeIDs(this.toIDNodes)})`;
    }

    private describeIDs(ids: QueryNode[]|undefined) {
        if (!ids) {
            return '?';
        }
        if (ids.length == 1) {
            return ids[0].describe();
        }
        return `[ ` + ids.map(id => id.describe()).join(' | ') + ` ]`;
    }
}

export class PartialEdgeIdentifier {
    constructor(public readonly fromIDNode?: QueryNode, public readonly toIDNode?: QueryNode) {

    }

    describe() {
        return `(${this.describeNode(this.fromIDNode)} -> ${this.describeNode(this.toIDNode)})`;
    }

    private describeNode(node: QueryNode|undefined) {
        if (!node) {
            return '?';
        }
        return node.describe();
    }
}

export class EdgeIdentifier {
    constructor(public readonly fromIDNode: QueryNode, public readonly toIDNode: QueryNode) {
    }

    describe() {
        return `(${this.fromIDNode.describe()} -> ${this.toIDNode.describe()})`;
    }
}
