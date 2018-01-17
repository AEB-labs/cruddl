import { GraphQLField, GraphQLObjectType } from 'graphql';
import { compact, indent } from '../utils/utils';
import { EdgeType, RelationFieldEdgeSide } from '../schema/edges';
import { QueryResultValidator } from './query-result-validators';

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
export class VariableQueryNode extends QueryNode {
    constructor(public readonly label?: string) {
        super();
        this.index = varIndices.next();
    }

    public readonly index: number;

    equals(other: this) {
        // use reference equality because VariableQueryNodes are used as tokens, the label is only informational
        return other === this;
    }

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
export class VariableAssignmentQueryNode extends QueryNode {
    constructor(params: { variableValueNode: QueryNode, resultNode: QueryNode, variableNode: VariableQueryNode }) {
        super();
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
        });
    }

    public readonly variableValueNode: QueryNode;
    public readonly resultNode: QueryNode;
    public readonly variableNode: VariableQueryNode;

    public describe() {
        return `let ${this.variableNode.describe()} = ${this.variableValueNode.describe()} in ${this.resultNode.describe()}`;
    }
}

export class PreExecQueryParms extends QueryNode {
    constructor(params: { query: QueryNode, resultVariable?: VariableQueryNode, resultValidator?: QueryResultValidator}) {
        super();
        this.query = params.query;
        this.resultVariable = params.resultVariable;
        this.resultValidator = params.resultValidator;
    }

    public readonly query: QueryNode;
    public readonly resultVariable: VariableQueryNode|undefined;
    public readonly resultValidator: QueryResultValidator|undefined;

    describe() {
        const resultVarDescr = this.resultVariable ? `${this.resultVariable.describe()} = ` : '';
        const validatorDescr = this.resultValidator ? ' validate result: ' + this.resultValidator.describe(): '';
        return resultVarDescr + '(\n' + indent(this.query.describe()) + '\n)' + validatorDescr;
    }
}

/**
 * A node that appends (maybe multiple) queries to a list of pre execution queries and then evaluates to a result node.
 *
 * Each pre execution query consists of an own QueryNode which contains the query that should be executed as an own
 * (AQL) statement before executing the current (AQL) statement to which the result node belongs. This makes it possible
 * to translate a QueryTree not just into a single (AQL) statement, but into a list of independent (AQL) statements.
 * The resulting list of (AQL) statements will then be executed sequentially in ONE transaction.
 *
 * Additionally each pre execution query can have a result variable and a result validator.
 *
 * Result-Variable: If a result variable is defined, it is possible to refer to the result of a previous pre execution
 * query in any of the subsequent pre execution queries or in the result node.
 * Note: The result of a pre execution query should always be a slim amount of simple (JSON) data. Ideally just an ID or
 * a list of IDs, because it will be hold as part of the transactional execution and injected as binding parameter into
 * the subsequent (AQL) statements (if they are used there).
 *
 * Result-Validators: With the help of a result validator it is possible to validate the result of a pre execution query,
 * before the subsequent queries will be executed. For example it is possible to check if an entity with a given ID
 * exists before adding an edge to that entity. In contrast to a simple (AQL) query, it ist possible to throw an error
 * within a result validator, which then causes a rollback of the whole transaction.
 */
export class WithPreExecutionQueryNode extends QueryNode {

    public readonly resultNode: QueryNode;
    public readonly preExecQueries: PreExecQueryParms[];

    constructor(params:{
        resultNode: QueryNode,
        preExecQueries: (PreExecQueryParms|undefined)[]
    }) {
        super();
        this.resultNode = params.resultNode;
        this.preExecQueries = compact(params.preExecQueries);
    }

    public describe() {
        if (!this.preExecQueries.length) {
            return this.resultNode.describe();
        }

        const preExecDescriptions = this.preExecQueries.map(q => q.describe());
        const resultDescr = '(\n' + indent(this.resultNode.describe()) + '\n)';

        return 'pre execute\n' + indent('' + // '' to move the arg label here in WebStorm
            preExecDescriptions.join('\nthen ') + '\n' +
            `return ${resultDescr}`
        );
    }
}

export class EntityFromIdQueryNode extends QueryNode {
    constructor(public readonly objectType: GraphQLObjectType, public readonly idNode: QueryNode) {
        super();
    }

    public describe() {
        return `${this.objectType.name.blue} with id (${this.idNode.describe()})`;
    }
}

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
        return `literal ${json.magenta}`;
    }
}

/**
 * A node that evaluates either to null
 */
export class NullQueryNode extends QueryNode {
    public describe() {
        return `null`;
    }
}

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
        return `error ${JSON.stringify(this.message)}`.red;
    }
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

/**
 * A node that evaluates to the value of a field of an object
 *
 * Note: this is unrelated to storing the value in a property of a result object, see ObjectQueryNode
 *
 * Runtime implementation note: if objectNode yields a non-object value (e.g. NULL), the result should be NULL.
 * (this is Arango logic and we currently rely on it in createScalarFieldPathValueNode()
 */
export class FieldQueryNode extends QueryNode {
    constructor(public readonly objectNode: QueryNode, public readonly field: GraphQLField<any, any>, public readonly objectType: GraphQLObjectType) {
        super();
    }

    public describe() {
        return `${this.objectNode.describe()}.${this.field.name.blue}`;
    }
}

/**
 * A node that evaluates to the id of a root entity
 */
export class RootEntityIDQueryNode extends QueryNode {
    constructor(public readonly objectNode: QueryNode) {
        super();
    }

    public describe() {
        return `id(${this.objectNode.describe()})`;
    }
}

/**
 * A node that evaluates in a JSON-like object structure with properties and values
 */
export class ObjectQueryNode extends QueryNode {
    constructor(public readonly properties: PropertySpecification[]) {
        super();

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
export class PropertySpecification extends QueryNode {
    constructor(public readonly propertyName: string,
                public readonly valueNode: QueryNode) {
        super();
    }

    describe(): string {
        return `${JSON.stringify(this.propertyName).green}: ${this.valueNode.describe()}`;
    }
}

/**
 * A node that evaluates to a list with query nodes as list entries
 */
export class ListQueryNode extends QueryNode {
    constructor(public readonly itemNodes: QueryNode[]) {
        super();
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
export class TypeCheckQueryNode extends QueryNode {
    constructor(public readonly valueNode: QueryNode, public type: BasicType) {
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
    NULL
}

export class ConditionalQueryNode extends QueryNode {
    constructor(public readonly condition: QueryNode, public readonly expr1: QueryNode, public readonly expr2: QueryNode) {
        super();
    }

    describe() {
        return `(if ${this.condition.describe()} then ${this.expr1.describe()} else ${this.expr2.describe()} endif)`;
    }
}

/**
 * A node that performs an operation with one operand
 */
export class UnaryOperationQueryNode extends QueryNode {
    constructor(public readonly valueNode: QueryNode, public readonly operator: UnaryOperator) {
        super();
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
export class BinaryOperationQueryNode extends QueryNode {
    constructor(public readonly lhs: QueryNode, public readonly operator: BinaryOperator, public readonly rhs: QueryNode) {
        super();
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
            case BinaryOperator.ADD:
                return '+';
            case BinaryOperator.SUBTRACT:
                return '-';
            case BinaryOperator.MULTIPLY:
                return '*';
            case BinaryOperator.DIVIDE:
                return '/';
            case BinaryOperator.MODULO:
                return '%';
            case BinaryOperator.APPEND:
                return 'APPEND';
            case BinaryOperator.PREPEND:
                return 'PREPEND';
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
    ADD,
    SUBTRACT,
    MULTIPLY,
    DIVIDE,
    MODULO,
    APPEND,
    PREPEND,
}

/**
 * A node that evaluates in the list of entities of a given type. use ListQueryNode to further process them
 */
export class EntitiesQueryNode extends QueryNode {
    constructor(public readonly objectType: GraphQLObjectType) {
        super();
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
export class TransformListQueryNode extends QueryNode {
    constructor(params: {
        listNode: QueryNode,
        innerNode?: QueryNode,
        filterNode?: QueryNode,
        orderBy?: OrderSpecification,
        maxCount?: number
        itemVariable?: VariableQueryNode
        variableAssignmentNodes?: VariableAssignmentQueryNode[]
    }) {
        super();
        this.itemVariable = params.itemVariable || new VariableQueryNode();
        this.listNode = params.listNode;
        this.innerNode = params.innerNode || this.itemVariable;
        this.filterNode = params.filterNode || new ConstBoolQueryNode(true);
        this.orderBy = params.orderBy || new OrderSpecification([]);
        this.maxCount = params.maxCount;
        this.variableAssignmentNodes = params.variableAssignmentNodes || [];
    }

    public readonly listNode: QueryNode;
    public readonly innerNode: QueryNode;
    public readonly filterNode: QueryNode;
    public readonly orderBy: OrderSpecification;
    public readonly maxCount: number | undefined;
    public readonly itemVariable: VariableQueryNode;

    /**
     * A list of variables that will be available in filter, order and innerNode
     * resultNode of these is IGNORED.
     */
    public readonly variableAssignmentNodes: VariableAssignmentQueryNode[];

    describe() {
        return `${this.listNode.describe()} as list with ${this.itemVariable.describe()} => \n` + indent('' + // '' to move the arg label here in WebStorm
            `where ${this.filterNode.describe()}\n` +
            `order by ${this.orderBy.describe()}\n` +
            this.variableAssignmentNodes.map(node => `let ${node.variableNode.describe()} = ${node.variableValueNode.describe()}\n`).join('') +
            `${this.maxCount != undefined ? `limit ${this.maxCount}\n` : ''}` +
            `as ${this.innerNode.describe()}`
        );
    }
}

export class CountQueryNode extends QueryNode {
    constructor(public readonly listNode: QueryNode) {
        super();
    }

    describe() {
        return `count(${this.listNode.describe()})`;
    }
}

/**
 * A node that evaluates to the first item of a list
 */
export class FirstOfListQueryNode extends QueryNode {
    constructor(public readonly listNode: QueryNode) {
        super();
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
export class MergeObjectsQueryNode extends QueryNode {
    constructor(public readonly objectNodes: QueryNode[]) {
        super();
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
export class ConcatListsQueryNode extends QueryNode {
    constructor(public readonly listNodes: QueryNode[]) {
        super();
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

export class OrderClause extends QueryNode {
    constructor(public readonly valueNode: QueryNode, public readonly direction: OrderDirection) {
        super();
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

export class OrderSpecification extends QueryNode {
    constructor(public readonly clauses: OrderClause[]) {
        super();
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
export class FollowEdgeQueryNode extends QueryNode {
    constructor(readonly edgeType: EdgeType, readonly sourceEntityNode: QueryNode, readonly sourceFieldSide: RelationFieldEdgeSide) {
        super();
    }

    describe() {
        switch (this.sourceFieldSide) {
            case RelationFieldEdgeSide.FROM_SIDE:
                return `follow forward ${this.edgeType.toString().blue} of ${this.sourceEntityNode.describe()}`;
            case RelationFieldEdgeSide.TO_SIDE:
                return `follow backward ${this.edgeType.toString().blue} of ${this.sourceEntityNode.describe()}`;
        }
    }
}

/**
 * A node that creates a new entity and evaluates to that new entity object
 */
export class CreateEntityQueryNode extends QueryNode {
    constructor(public readonly objectType: GraphQLObjectType, public readonly objectNode: QueryNode, public readonly affectedFields: AffectedFieldInfoQueryNode[]) {
        super();
    }

    describe() {
        return `create ${this.objectType.name} entity with values ${this.objectNode.describe()} (affects fields ${this.affectedFields.map(f => f.describe()).join(', ')})`;
    }
}

/**
 * A node that indicates that a field of a node is set, without being evaluated
 */
export class AffectedFieldInfoQueryNode extends QueryNode {
    constructor(public readonly objectType: GraphQLObjectType, public readonly field: GraphQLField<any, any>) {
        super();
    }

    describe() {
        return `${this.objectType}.${this.field.name}`;
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
export class UpdateEntitiesQueryNode extends QueryNode {
    constructor(params: {
        objectType: GraphQLObjectType,
        filterNode: QueryNode,
        updates: SetFieldQueryNode[],
        maxCount?: number,
        currentEntityVariable?: VariableQueryNode,
        affectedFields: AffectedFieldInfoQueryNode[]
    }) {
        super();
        this.objectType = params.objectType;
        this.filterNode = params.filterNode;
        this.updates = params.updates;
        this.maxCount = params.maxCount;
        this.currentEntityVariable = params.currentEntityVariable || new VariableQueryNode();
        this.affectedFields = params.affectedFields;
    }

    public readonly objectType: GraphQLObjectType;
    public readonly filterNode: QueryNode;
    public readonly updates: SetFieldQueryNode[];
    public readonly maxCount: number | undefined;
    public readonly currentEntityVariable: VariableQueryNode;
    public readonly affectedFields: AffectedFieldInfoQueryNode[];

    describe() {
        return `update ${this.objectType.name} entities ` +
            `where (${this.currentEntityVariable.describe()} => ${this.filterNode.describe()}) ` +
            `with values (${this.currentEntityVariable.describe()} => {\n` +
            indent(this.updates.map(p => p.describe()).join(',\n')) +
            `\n} (affects fields ${this.affectedFields.map(f => f.describe()).join(', ')})`;
    }
}

/**
 * Specifies one property of a an ObjectQueryNode, and indicates that this will set a field of an object
 */
export class SetFieldQueryNode extends PropertySpecification {
    constructor(public readonly field: GraphQLField<any, any>,
                public readonly objectType: GraphQLObjectType,
                public readonly valueNode: QueryNode) {
        super(field.name, valueNode);
    }
}

/**
 * A node that deletes existing entities and evaluates to the entities before deletion
 */
export class DeleteEntitiesQueryNode extends QueryNode {
    constructor(params: {
        objectType: GraphQLObjectType,
        filterNode: QueryNode,
        maxCount?: number,
        currentEntityVariable?: VariableQueryNode
    }) {
        super();
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

export class AddEdgesQueryNode extends QueryNode {

    // TODO: accept one QueryNode which evaluates to the lits of edge ids somehow?
    // (currently, adding 50 edges generates 50 bound variables with the literal values)

    constructor(readonly edgeType: EdgeType, readonly edges: EdgeIdentifier[]) {
        super();
    }

    describe() {
        return `add edges to ${this.edgeType}: [\n` +
            indent(this.edges.map(edge => edge.describe()).join(',\n')) +
            `\n]`;
    }
}

export class RemoveEdgesQueryNode extends QueryNode {
    constructor(readonly edgeType: EdgeType, readonly edgeFilter: EdgeFilter) {
        super();
    }

    describe() {
        return `remove edges from ${this.edgeType} matching ${this.edgeFilter.describe()}`;
    }
}

/**
 * Checks if an edge specified by existingEdgeFilter exists. If it does, replaces it by the newEdge. If it does not,
 * creates newEge.
 */
export class SetEdgeQueryNode extends QueryNode {
    constructor(params: { edgeType: EdgeType, existingEdgeFilter: PartialEdgeIdentifier, newEdge: EdgeIdentifier }) {
        super();
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
export class EdgeFilter extends QueryNode {
    constructor(readonly fromIDNodes?: QueryNode[], readonly toIDNodes?: QueryNode[]) {
        super();
    }

    describe() {
        return `(${this.describeIDs(this.fromIDNodes)} -> ${this.describeIDs(this.toIDNodes)})`;
    }

    private describeIDs(ids: QueryNode[] | undefined) {
        if (!ids) {
            return '?';
        }
        if (ids.length == 1) {
            return ids[0].describe();
        }
        return `[ ` + ids.map(id => id.describe()).join(' | ') + ` ]`;
    }
}

export class PartialEdgeIdentifier extends QueryNode {
    constructor(public readonly fromIDNode?: QueryNode, public readonly toIDNode?: QueryNode) {
        super();
    }

    describe() {
        return `(${this.describeNode(this.fromIDNode)} -> ${this.describeNode(this.toIDNode)})`;
    }

    private describeNode(node: QueryNode | undefined) {
        if (!node) {
            return '?';
        }
        return node.describe();
    }
}

export class EdgeIdentifier extends QueryNode {
    constructor(public readonly fromIDNode: QueryNode, public readonly toIDNode: QueryNode) {
        super();
    }

    describe() {
        return `(${this.fromIDNode.describe()} -> ${this.toIDNode.describe()})`;
    }
}