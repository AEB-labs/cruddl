import {
    AddEdgesQueryNode, BasicType, BinaryOperationQueryNode, BinaryOperator, ConcatListsQueryNode, ConditionalQueryNode,
    ConstBoolQueryNode, CreateEntityQueryNode, DeleteEntitiesQueryNode, EdgeFilter, EdgeIdentifier, EntitiesQueryNode,
    FieldQueryNode, FirstOfListQueryNode, FollowEdgeQueryNode, RootEntityIDQueryNode, ListQueryNode, LiteralQueryNode,
    MergeObjectsQueryNode,
    ObjectQueryNode, OrderDirection, OrderSpecification, PartialEdgeIdentifier, QueryNode, RemoveEdgesQueryNode,
    SetEdgeQueryNode, TransformListQueryNode, TypeCheckQueryNode, UnaryOperationQueryNode, UnaryOperator,
    UpdateEntitiesQueryNode, VariableAssignmentQueryNode, VariableQueryNode, CountQueryNode
} from '../../query/definition';
import { aql, AQLFragment, AQLVariable } from './aql';
import { getCollectionNameForEdge, getCollectionNameForRootEntity } from './arango-basics';
import { GraphQLNamedType, GraphQLObjectType } from 'graphql';
import { EdgeType } from '../../schema/edges';

class QueryContext {
    private variableMap = new Map<VariableQueryNode, AQLVariable>();

    introduceVariable(variableNode: VariableQueryNode): QueryContext {
        if (this.variableMap.has(variableNode)) {
            throw new Error(`Variable ${variableNode.describe()} is introduced twice`);
        }
        const variable = new AQLVariable();
        const newMap = new Map(this.variableMap);
        newMap.set(variableNode, variable);
        const newContext = new QueryContext();
        newContext.variableMap = newMap;
        return newContext;
    }

    getVariable(variableNode: VariableQueryNode): AQLFragment {
        const variable = this.variableMap.get(variableNode);
        if (!variable) {
            throw new Error(`Variable ${variableNode.toString()} is used but not introduced`);
        }
        return aql`${variable}`;
    }
}

type NodeProcessor<T extends QueryNode> = (node: T, context: QueryContext) => AQLFragment;

namespace aqlExt {
    export function safeJSONKey(key: string): AQLFragment {
        if (aql.isSafeIdentifier(key)) {
            return aql`${aql.string(key)}`; // if safe, use "name" approach
        } else {
            return aql`${key}`; // fall back to bound values
        }
    }

    export function parenthesizeList(...content: AQLFragment[]): AQLFragment {
        return aql.lines(
            aql`(`,
            aql.indent(aql.lines(...content)),
            aql`)`
        );
    }

    export function parenthesizeObject(...content: AQLFragment[]): AQLFragment {
        return aql`FIRST${parenthesizeList(...content)}`;
    }
}

const processors : { [name: string]: NodeProcessor<any> } = {
    Literal(node: LiteralQueryNode): AQLFragment {
        return aql`${node.value}`;
    },

    Null(): AQLFragment {
        return aql`null`;
    },

    ConstBool(node: ConstBoolQueryNode): AQLFragment {
        return node.value ? aql`true` : aql`false`;
    },

    Object(node: ObjectQueryNode, context): AQLFragment {
        if (!node.properties.length) {
            return aql`{}`;
        }

        const properties = node.properties.map(p =>
            aql`${aqlExt.safeJSONKey(p.propertyName)}: ${processNode(p.valueNode, context)}`);
        return aql.lines(
            aql`{`,
            aql.indent(aql.join(properties, aql`,\n`)),
            aql`}`
        );
    },

    List(node: ListQueryNode, context): AQLFragment {
        const test = aql`"${aql.string('"test')}`;
        if (!node.itemNodes.length) {
            return aql`[]`;
        }

        return aql.lines(
            aql`[`,
            aql.indent(aql.join(node.itemNodes.map(itemNode => processNode(itemNode, context)), aql`,\n`)),
            aql`]`
        );
    },

    ConcatLists(node: ConcatListsQueryNode, context): AQLFragment {
        const listNodes = node.listNodes.map(node => processNode(node, context));
        const listNodeStr = aql.join(listNodes, aql`, `);
        // note: UNION just appends, there is a special UNION_DISTINCT to filter out duplicates
        return aql`UNION(${listNodeStr})`;
    },

    Variable(node: VariableQueryNode, context): AQLFragment {
        return context.getVariable(node);
    },

    VariableAssignment(node: VariableAssignmentQueryNode, context): AQLFragment {
        const newContext = context.introduceVariable(node.variableNode);
        const tmpVar = newContext.getVariable(node.variableNode);

        // note that we have to know statically if the context var is a list or an object
        // assuming object here because lists are not needed currently
        return aqlExt.parenthesizeObject(
            aql`LET ${tmpVar} = ${processNode(node.variableValueNode, newContext)}`,
            aql`RETURN ${processNode(node.resultNode, newContext)}`
        );
    },

    Field(node: FieldQueryNode, context): AQLFragment {
        const object = processNode(node.objectNode, context);
        let identifier = node.field.name;
        if (aql.isSafeIdentifier(identifier)) {
            return aql`${object}.${aql.identifier(identifier)}`;
        }
        // fall back to bound values. do not attempt aql.string for security reasons - should not be the case normally, anyway.
        return aql`${object}[${identifier}]`;
    },

    RootEntityID(node: RootEntityIDQueryNode, context): AQLFragment {
        return aql`${processNode(node.objectNode, context)}._key`; // ids are stored in _key field
    },

    TransformList(node: TransformListQueryNode, context): AQLFragment {
        const newContext = context.introduceVariable(node.itemVariable);
        const itemVar = newContext.getVariable(node.itemVariable);
        const list = processNode(node.listNode, context);
        return aqlExt.parenthesizeList(
            aql`FOR ${itemVar}`,
            aql`IN ${list}`,
            aql`FILTER ${processNode(node.filterNode, newContext)}`,
            generateSortAQL(node.orderBy, newContext),
            node.maxCount != undefined ? aql`LIMIT ${node.maxCount}` : aql``,
            aql`RETURN ${processNode(node.innerNode, newContext)}`
        );
    },

    Count(node: CountQueryNode, context): AQLFragment {
        if (node.listNode instanceof FieldQueryNode || node.listNode instanceof EntitiesQueryNode) {
            // These cases are known to be optimized
            // TODO this does not catch the safe-list case (list ? list : []), where we could optimize to (list ? LENGTH(list) : 0)
            // so we probably need to add an optimization to the query tree builder
            return aql`LENGTH(${processNode(node.listNode, context)})`;
        }

        // in the general case (mostly a TransformListQueryNode), it is better to use the COLLeCT WITH COUNT syntax
        // because it avoids building the whole collection temporarily in memory
        // however, https://docs.arangodb.com/3.2/AQL/Examples/Counting.html does not really mention this case, so we
        // should evaluate it again
        const nodeVar = aql.variable();
        const countVar = aql.variable();
        return aqlExt.parenthesizeObject(
            aql`FOR ${nodeVar}`,
            aql`IN ${processNode(node.listNode, context)}`,
            aql`COLLECT WITH COUNT INTO ${countVar}`,
            aql`return ${countVar}`
        );
    },

    MergeObjects(node: MergeObjectsQueryNode, context): AQLFragment {
        const objectList = node.objectNodes.map(node => processNode(node, context));
        const objectsFragment = aql.join(objectList, aql`, `);
        return aql`MERGE(${objectsFragment})`;
    },

    FirstOfList(node: FirstOfListQueryNode, context): AQLFragment {
        return aql`FIRST(${processNode(node.listNode, context)})`;
    },

    BinaryOperation(node: BinaryOperationQueryNode, context): AQLFragment {
        const lhs = processNode(node.lhs, context);
        const rhs = processNode(node.rhs, context);
        const op = getAQLOperator(node.operator);
        if (op) {
            return aql`(${lhs} ${op} ${rhs})`;
        }

        // TODO maybe use LIKE for fulltext indices
        switch (node.operator) {
            case BinaryOperator.CONTAINS:
                return aql`CONTAINS(${lhs}, ${rhs})`;
            case BinaryOperator.STARTS_WITH:
                return aql`(LEFT(${lhs}, LENGTH(${rhs})) == ${rhs})`;
            case BinaryOperator.ENDS_WITH:
                return aql`(RIGHT(${lhs}, LENGTH(${rhs})) == ${rhs})`;
            default:
                throw new Error(`Unsupported binary operator: ${op}`);
        }
    },

    UnaryOperation(node: UnaryOperationQueryNode, context) {
        switch (node.operator) {
            case UnaryOperator.NOT:
                return aql`!(${processNode(node.valueNode, context)})`;
            case UnaryOperator.JSON_STRINGIFY:
                return aql`JSON_STRINGIFY(${processNode(node.valueNode, context)})`;
            default:
                throw new Error(`Unsupported unary operator: ${node.operator}`);
        }
    },

    Conditional(node: ConditionalQueryNode, context) {
        const cond = processNode(node.condition, context);
        const expr1 = processNode(node.expr1, context);
        const expr2 = processNode(node.expr2, context);
        return aql`(${cond} ? ${expr1} : ${expr2})`;
    },

    TypeCheck(node: TypeCheckQueryNode, context) {
        const value = processNode(node.valueNode, context);

        switch (node.type) {
            case BasicType.SCALAR:
                return aql`(IS_BOOL(${value}) || IS_NUMBER(${value}) || IS_STRING(${value}))`;
            case BasicType.LIST:
                return aql`IS_LIST(${value})`;
            case BasicType.OBJECT:
                return aql`IS_OBJECT(${value})`;
            case BasicType.NULL:
                return aql`IS_NULL(${value})`;
        }
    },

    Entities(node: EntitiesQueryNode): AQLFragment {
        return getCollectionForType(node.objectType);
    },

    FollowEdge(node: FollowEdgeQueryNode, context): AQLFragment {
        const tmpVar = aql.variable();
        // need to wrap this in a subquery because ANY is not possible as first token of an expression node in AQL
        // sadly means that with a TransformList, there are two nested FORs (but should be optimized away by arangodb)
        return aqlExt.parenthesizeList(
            aql`FOR ${tmpVar}`,
            aql`IN ANY ${processNode(node.sourceEntityNode, context)} ${getCollectionForEdge(node.edgeType)}`,
            aql`RETURN ${tmpVar}`
        );
    },

    CreateEntity(node: CreateEntityQueryNode, context): AQLFragment {
        return aqlExt.parenthesizeObject(
            aql`INSERT ${processNode(node.objectNode, context)} IN ${getCollectionForType(node.objectType)}`,
            aql`RETURN NEW`
        );
    },

    UpdateEntities(node: UpdateEntitiesQueryNode, context) {
        const newContext = context.introduceVariable(node.currentEntityVariable);
        const entityVar = newContext.getVariable(node.currentEntityVariable);
        return aqlExt.parenthesizeList(
            aql`FOR ${entityVar}`,
            aql`IN ${getCollectionForType(node.objectType)}`,
            aql`FILTER ${processNode(node.filterNode, newContext)}`,
            node.maxCount !== undefined ? aql`LIMIT ${node.maxCount}` : aql``,
            aql`UPDATE ${entityVar}`,
            aql`WITH ${processNode(new ObjectQueryNode(node.updates), newContext)}`,
            aql`IN ${getCollectionForType(node.objectType)}`,
            aql`OPTIONS { mergeObjects: false }`,
            aql`RETURN NEW`
        );
    },

    DeleteEntities(node: DeleteEntitiesQueryNode, context) {
        const newContext = context.introduceVariable(node.currentEntityVariable);
        const entityVar = newContext.getVariable(node.currentEntityVariable);
        return aqlExt.parenthesizeList(
            aql`FOR ${entityVar}`,
            aql`IN ${getCollectionForType(node.objectType)}`,
            aql`FILTER ${processNode(node.filterNode, newContext)}`,
            node.maxCount !== undefined ? aql`LIMIT ${node.maxCount}` : aql``,
            aql`REMOVE ${entityVar}`,
            aql`IN ${getCollectionForType(node.objectType)}`,
            aql`RETURN OLD`
        );
    },

    AddEdges(node: AddEdgesQueryNode, context) {
        const edgeVar = aql.variable();
        return aqlExt.parenthesizeList(
            aql`FOR ${edgeVar}`,
            aql`IN [ ${aql.join(node.edges.map(edge => formatEdge(node.edgeType, edge, context)), aql`, `)} ]`,
            aql`UPSERT { _from: ${edgeVar}._from, _to: ${edgeVar}._to }`, // need to unpack avoid dynamic property names in UPSERT example filter
            aql`INSERT ${edgeVar}`,
            aql`UPDATE {}`,
            aql`IN ${getCollectionForEdge(node.edgeType)}`
        );
    },

    RemoveEdges(node: RemoveEdgesQueryNode, context) {
        const edgeVar = aql.variable();
        return aqlExt.parenthesizeList(
            aql`FOR ${edgeVar}`,
            aql`IN ${getCollectionForEdge(node.edgeType)}`,
            aql`FILTER ${formatEdgeFilter(node.edgeType, node.edgeFilter, edgeVar, context)}`,
            aql`REMOVE ${edgeVar}`,
            aql`IN ${getCollectionForEdge(node.edgeType)}`,
        );
    },

    SetEdge(node: SetEdgeQueryNode, context) {
        const edgeVar = aql.variable();
        return aqlExt.parenthesizeList(
            aql`UPSERT ${formatEdge(node.edgeType, node.existingEdge, context)}`,
            aql`INSERT ${formatEdge(node.edgeType, node.newEdge, context)}`,
            aql`UPDATE ${formatEdge(node.edgeType, node.newEdge, context)}`,
            aql`IN ${getCollectionForEdge(node.edgeType)}`,
        );
    }
};

/**
 * Gets an aql fragment that evaluates to a string of the format "collectionName/objectKey", given a query node that
 * evaluates to the "object id", which is, in arango terms, the _key.
 */
function getFullIDFromKeyNode(node: QueryNode, type: GraphQLObjectType, context: QueryContext): AQLFragment {
    // special handling to avoid concat if possible - do not alter the behavior
    if (node instanceof LiteralQueryNode && typeof node.value == 'string') {
        // just append the node to the literal key in JavaScript and bind it as a string
        return aql`${getCollectionNameForRootEntity(type) + '/' + node.value}`;
    }
    if (node instanceof RootEntityIDQueryNode) {
        // access the _id field. processNode(node) would access the _key field instead.
        return aql`${processNode(node.objectNode, context)}._id`;
    }

    // fall back to general case
    return aql`CONCAT(${getCollectionNameForRootEntity(type) + '/'}, ${processNode(node, context)})`;
}

function formatEdge(edgeType: EdgeType, edge: PartialEdgeIdentifier|EdgeIdentifier, context: QueryContext): AQLFragment {
    const conditions = [];
    if (edge.fromIDNode) {
        conditions.push(aql`_from: ${getFullIDFromKeyNode(edge.fromIDNode, edgeType.fromType, context)}`);
    }
    if (edge.toIDNode) {
        conditions.push(aql`_to: ${getFullIDFromKeyNode(edge.toIDNode, edgeType.toType, context)}`);
    }

    return aql`{${aql.join(conditions, aql`, `)}}`;
}

function formatEdgeFilter(edgeType: EdgeType, edge: EdgeFilter, edgeFragment: AQLFragment, context: QueryContext) {
    function makeList(ids: QueryNode[], type: GraphQLObjectType) {
        return aql`[${aql.join(ids.map(node => getFullIDFromKeyNode(node, type, context)), aql`, `)}]`;
    }

    const conditions = [];
    if (edge.fromIDNodes) {
        conditions.push(aql`${edgeFragment}._from IN ${makeList(edge.fromIDNodes, edgeType.fromType)}`);
    }
    if (edge.toIDNodes) {
        conditions.push(aql`${edgeFragment}._to IN ${makeList(edge.toIDNodes, edgeType.toType)}`);
    }

    return aql.join(conditions, aql` && `);
}

function getAQLOperator(op: BinaryOperator): AQLFragment|undefined {
    switch (op) {
        case BinaryOperator.AND:
            return aql`&&`;
        case BinaryOperator.OR:
            return aql`||`;
        case BinaryOperator.EQUAL:
            return aql`==`;
        case BinaryOperator.UNEQUAL:
            return aql`!=`;
        case BinaryOperator.LESS_THAN:
            return aql`<`;
        case BinaryOperator.LESS_THAN_OR_EQUAL:
            return aql`<=`;
        case BinaryOperator.GREATER_THAN:
            return aql`>`;
        case BinaryOperator.GREATER_THAN_OR_EQUAL:
            return aql`>=`;
        case BinaryOperator.IN:
            return aql`IN`;
        default:
            return undefined;
    }
}

function generateSortAQL(orderBy: OrderSpecification, context: QueryContext): AQLFragment {
    if (orderBy.isUnordered()) {
        return aql``;
    }

    function dirAQL(dir: OrderDirection) {
        if (dir == OrderDirection.DESCENDING) {
            return aql` DESC`;
        }
        return aql``;
    }

    const clauses = orderBy.clauses.map(cl => aql`(${processNode(cl.valueNode, context)}) ${dirAQL(cl.direction)}`);

    return aql`SORT ${aql.join(clauses, aql`, `)}`;
}

const processorMap: {[name: string]: NodeProcessor<any>} = {};
for (const processorName in processors) {
    processorMap[processorName + 'QueryNode'] = processors[processorName];
}

function processNode(node: QueryNode, context: QueryContext): AQLFragment {
    const type = node.constructor.name;
    if (!(type in processorMap)) {
        throw new Error(`Unsupported query type: ${type}`);
    }
    return processorMap[type](node, context);
}

export function getAQLForQuery(node: QueryNode): AQLFragment {
    return aql`RETURN ${processNode(node, new QueryContext())}`;
}

export function getCollectionForType(type: GraphQLNamedType) {
    return aql.collection(getCollectionNameForRootEntity(type));
}

export function getCollectionForEdge(edgeType: EdgeType) {
    return aql.collection(getCollectionNameForEdge(edgeType));
}
