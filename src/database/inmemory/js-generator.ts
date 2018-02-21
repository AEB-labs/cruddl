import {
    AddEdgesQueryNode, BasicType, BinaryOperationQueryNode, BinaryOperator, ConcatListsQueryNode, ConditionalQueryNode,
    ConstBoolQueryNode, ConstIntQueryNode, CountQueryNode, CreateEntityQueryNode, DeleteEntitiesQueryNode,
    EntitiesQueryNode, EntityFromIdQueryNode, FieldQueryNode, FirstOfListQueryNode, FollowEdgeQueryNode, ListQueryNode,
    LiteralQueryNode, MergeObjectsQueryNode, ObjectQueryNode, OrderClause, OrderDirection, OrderSpecification,
    QueryNode,
    RemoveEdgesQueryNode, RootEntityIDQueryNode, RuntimeErrorQueryNode, SetEdgeQueryNode, TransformListQueryNode,
    TypeCheckQueryNode, UnaryOperationQueryNode, UnaryOperator, UpdateEntitiesQueryNode, VariableAssignmentQueryNode,
    VariableQueryNode, WithPreExecutionQueryNode
} from '../../query/definition';
import { js, JSCompoundQuery, JSFragment, JSQueryResultVariable, JSVariable } from './js';
import { GraphQLNamedType } from 'graphql';
import { QueryResultValidator } from '../../query/query-result-validators';
import { RUNTIME_ERROR_TOKEN } from '../../query/runtime-errors';
import { decapitalize, flatMap } from '../../utils/utils';
import { getCollectionNameForRootEntity } from './inmemory-basics';

enum AccessType {
    READ,
    WRITE
}

const ID_FIELD_NAME = '_key';

class QueryContext {
    private variableMap = new Map<VariableQueryNode, JSVariable>();
    private preExecQueries: JSCompoundQuery[] = [];

    /**
     * Creates a new QueryContext with an independent variable map except that all query result variables of this
     * context are available.
     */
    private newPreExecContext(): QueryContext{
        const newContext = new QueryContext();
        this.variableMap.forEach((jsVar, varNode) => {
            if (jsVar instanceof JSQueryResultVariable) {
                newContext.variableMap.set(varNode, jsVar);
            }
        });
        return newContext;
    }

    /**
     * Creates a new QueryContext that is identical to this one but has one additional variable binding
     * @param variableNode the variable token as it is referenced in the query tree
     * @param jsVariable the variable token as it will be available within the JS fragment
     */
    private newNestedContextWithNewVariable(variableNode: VariableQueryNode, jsVariable: JSVariable): QueryContext {
        if (this.variableMap.has(variableNode)) {
            throw new Error(`Variable ${variableNode} is introduced twice`);
        }
        const newContext = new QueryContext();
        newContext.variableMap = new Map(this.variableMap);
        newContext.variableMap.set(variableNode, jsVariable);
        newContext.preExecQueries = this.preExecQueries;
        return newContext;
    }

    /**
     * Creates a new QueryContext that is identical to this one but has one additional variable binding
     *
     * The JSFragment for the variable will be available via getVariable().
     *
     * @param {VariableQueryNode} variableNode the variable as referenced in the query tree
     * @returns {QueryContext} the nested context
     */
    introduceVariable(variableNode: VariableQueryNode): QueryContext {
        const variable = new JSVariable(variableNode.label);
        return this.newNestedContextWithNewVariable(variableNode, variable);
    }

    /**
     * Creates a new QueryContext that includes an additional transaction step and adds resultVariable to the scope
     * which will contain the result of the query
     *
     * The preExecQuery is evaluated in an independent context that has access to all previous preExecQuery result
     * variables.
     *
     * @param preExecQuery the query to execute as transaction step
     * @param resultVariable the variable to store the query result
     * @param resultValidator an optional validator for the query result
     */
    addPreExecuteQuery(preExecQuery: QueryNode, resultVariable?: VariableQueryNode, resultValidator?: QueryResultValidator): QueryContext {
        let resultVar: JSQueryResultVariable|undefined;
        let newContext: QueryContext;
        if (resultVariable) {
            resultVar = new JSQueryResultVariable(resultVariable.label)
            newContext = this.newNestedContextWithNewVariable(resultVariable, resultVar);
        } else {
            resultVar = undefined;
            newContext = this;
        }

        const jsQuery = createJSCompoundQuery(preExecQuery, resultVar, resultValidator, this.newPreExecContext());

        this.preExecQueries.push(jsQuery);
        return newContext;
    }

    /**
     * Gets an JSFragment that evaluates to the value of a variable in the current scope
     */
    getVariable(variableNode: VariableQueryNode): JSFragment {
        const variable = this.variableMap.get(variableNode);
        if (!variable) {
            throw new Error(`Variable ${variableNode.toString()} is used but not introduced`);
        }
        return js`${variable}`;
    }

    getPreExecuteQueries(): JSCompoundQuery[] {
        return this.preExecQueries;
    }
}

function createJSCompoundQuery(node: QueryNode,
                                resultVariable: JSQueryResultVariable|undefined,
                                resultValidator: QueryResultValidator|undefined,
                                context: QueryContext): JSCompoundQuery {
    const jsQuery = processNode(node, context);
    const preExecQueries = context.getPreExecuteQueries();

    return new JSCompoundQuery(preExecQueries, jsQuery, resultVariable, resultValidator);
}

type NodeProcessor<T extends QueryNode> = (node: T, context: QueryContext) => JSFragment;

namespace jsExt {
    export function safeJSONKey(key: string): JSFragment {
        if (js.isSafeIdentifier(key)) {
            return js`${js.string(key)}`; // if safe, use "name" approach
        } else {
            return js`${key}`; // fall back to bound values
        }
    }

    export function executingFunction(...content: JSFragment[]): JSFragment {
        return js.lines(
            js`(function() {`,
            js.indent(js.lines(...content)),
            js`})()`
        );
    }

    export function lambda(variable: JSVariable, expression: JSFragment) {
        return js`${variable} => (${expression})`
    }
}

const processors : { [name: string]: NodeProcessor<any> } = {
    Literal(node: LiteralQueryNode): JSFragment {
        return js`${node.value}`;
    },

    Null(): JSFragment {
        return js`undefined`;
    },

    RuntimeError(node: RuntimeErrorQueryNode): JSFragment {
        const runtimeErrorToken = js.code(RUNTIME_ERROR_TOKEN);
        return js`{${runtimeErrorToken}: ${node.message}}`;
    },

    ConstBool(node: ConstBoolQueryNode): JSFragment {
        return node.value ? js`true` : js`false`;
    },

    ConstInt(node: ConstIntQueryNode): JSFragment {
        return js.integer(node.value);
    },

    Object(node: ObjectQueryNode, context): JSFragment {
        if (!node.properties.length) {
            return js`{}`;
        }

        const properties = node.properties.map(p =>
            js`${jsExt.safeJSONKey(p.propertyName)}: ${processNode(p.valueNode, context)}`);
        return js.lines(
            js`{`,
            js.indent(js.join(properties, js`,\n`)),
            js`}`
        );
    },

    List(node: ListQueryNode, context): JSFragment {
        if (!node.itemNodes.length) {
            return js`[]`;
        }

        return js.lines(
            js`[`,
            js.indent(js.join(node.itemNodes.map(itemNode => processNode(itemNode, context)), js`,\n`)),
            js`]`
        );
    },

    ConcatLists(node: ConcatListsQueryNode, context): JSFragment {
        const listNodes = node.listNodes.map(node => processNode(node, context));
        const listNodeStr = js.join(listNodes, js`, `);
        // note: UNION just appends, there is a special UNION_DISTINCT to filter out duplicates
        return js`UNION(${listNodeStr})`;
    },

    Variable(node: VariableQueryNode, context): JSFragment {
        return context.getVariable(node);
    },

    VariableAssignment(node: VariableAssignmentQueryNode, context): JSFragment {
        const newContext = context.introduceVariable(node.variableNode);
        const tmpVar = newContext.getVariable(node.variableNode);

        return jsExt.executingFunction(
            js`const ${tmpVar} = ${processNode(node.variableValueNode, newContext)};`,
            js`return ${processNode(node.resultNode, newContext)}`
        );
    },

    WithPreExecution(node: WithPreExecutionQueryNode, context): JSFragment {
        let currentContext = context;
        for (const preExecParm of node.preExecQueries) {
            currentContext = currentContext.addPreExecuteQuery(preExecParm.query, preExecParm.resultVariable, preExecParm.resultValidator);
        }

        return js`${processNode(node.resultNode, currentContext)}`;
    },

    EntityFromId(node:  EntityFromIdQueryNode, context): JSFragment {
        const itemVariable = new VariableQueryNode(decapitalize(node.objectType.name));
        return processNode(new FirstOfListQueryNode(new TransformListQueryNode({
            listNode: new EntitiesQueryNode(node.objectType),
            itemVariable,
            filterNode: new BinaryOperationQueryNode(new RootEntityIDQueryNode(itemVariable), BinaryOperator.EQUAL, node.idNode)
        })), context);
    },

    Field(node: FieldQueryNode, context): JSFragment {
        const object = processNode(node.objectNode, context);
        let identifier = node.field.name;
        if (js.isSafeIdentifier(identifier)) {
            return js`${object}.${js.identifier(identifier)}`;
        }
        // fall back to bound values. do not attempt js.string for security reasons - should not be the case normally, anyway.
        return js`${object}[${identifier}]`;
    },

    RootEntityID(node: RootEntityIDQueryNode, context): JSFragment {
        return js`${processNode(node.objectNode, context)}.${js.identifier(ID_FIELD_NAME)}`;
    },

    TransformList(node: TransformListQueryNode, context): JSFragment {
        let itemContext = context.introduceVariable(node.itemVariable);
        const itemVar = itemContext.getVariable(node.itemVariable);

        // TODO this should really be evaluated once and not in filter/map/sort each time
        function evaluateWithVars(innerFn: (context: QueryContext) => JSFragment): JSFragment {
            if (node.variableAssignmentNodes.length == 0) {
                return innerFn(itemContext);
            }
            let innerContext = context;
            return jsExt.executingFunction(
                ...node.variableAssignmentNodes.map(assignmentNode => {
                    itemContext = itemContext.introduceVariable(assignmentNode.variableNode);
                    const variable = itemContext.getVariable(assignmentNode.variableNode);
                    return js`const ${variable} = ${assignmentNode.variableValueNode}`
                }),
                js`return ${innerFn(innerContext)}`
            );
        }

        function lambda(exprNode: QueryNode) {
            return jsExt.lambda(itemVar, evaluateWithVars(ctx => processNode(exprNode, ctx)));
        }

        const comparator = node.orderBy.isUnordered() ? undefined : evaluateWithVars(ctx => getComparatorForOrderSpecification(node.orderBy, itemVar, ctx));
        const isFiltered = !(node.filterNode instanceof ConstBoolQueryNode) || node.filterNode.value != true;
        const isMapped = node.innerNode != node.itemVariable;

        return js.lines(
            processNode(node.listNode, context),
            js.indent(js.lines(
                isFiltered ? js`.filter(${lambda(node.filterNode)})` : js``,
                comparator ? js`.slice().sort(${comparator})` : js``, // need slice() to not replace something in-place
                node.maxCount != undefined ? js`.slice(0, ${node.maxCount})` : js``,
                isMapped ? js`.map(${lambda(node.innerNode)})` : js``
            ))
        );
    },

    Count(node: CountQueryNode, context): JSFragment {
        return js`${processNode(node.listNode, context)}.length`;
    },

    MergeObjects(node: MergeObjectsQueryNode, context): JSFragment {
        const objectList = node.objectNodes.map(node => processNode(node, context));
        const objectsFragment = js.join(objectList, js`, `);
        return js`Object.assign({}, ${objectsFragment})`;
    },

    FirstOfList(node: FirstOfListQueryNode, context): JSFragment {
        return js`(${processNode(node.listNode, context)})[0]`;
    },

    BinaryOperation(node: BinaryOperationQueryNode, context): JSFragment {
        const lhs = processNode(node.lhs, context);
        const rhs = processNode(node.rhs, context);
        const op = getJSOperator(node.operator);
        if (op) {
            return js`(${lhs} ${op} ${rhs})`;
        }

        switch (node.operator) {
            case BinaryOperator.CONTAINS:
                return js`${lhs}.includes(${rhs})`;
            case BinaryOperator.IN:
                return js`${rhs}.includes(${lhs})`;
            case BinaryOperator.STARTS_WITH:
                return js`${lhs}.startsWith(${rhs})`;
            case BinaryOperator.ENDS_WITH:
                return js`${lhs}.endsWith(${rhs})`;
            case BinaryOperator.APPEND: // TODO would not work for lists, is this neccessary?
                return js`String(${lhs}) + String(${rhs})`;
            case BinaryOperator.PREPEND:
                return js`String(${rhs}) + String(${lhs})`;
            default:
                throw new Error(`Unsupported binary operator: ${op}`);
        }
    },

    UnaryOperation(node: UnaryOperationQueryNode, context) {
        switch (node.operator) {
            case UnaryOperator.NOT:
                return js`!(${processNode(node.valueNode, context)})`;
            case UnaryOperator.JSON_STRINGIFY:
                return js`JSON.stringify(${processNode(node.valueNode, context)})`;
            default:
                throw new Error(`Unsupported unary operator: ${node.operator}`);
        }
    },

    Conditional(node: ConditionalQueryNode, context) {
        const cond = processNode(node.condition, context);
        const expr1 = processNode(node.expr1, context);
        const expr2 = processNode(node.expr2, context);
        return js`(${cond} ? ${expr1} : ${expr2})`;
    },

    TypeCheck(node: TypeCheckQueryNode, context) {
        const value = js`(${processNode(node.valueNode, context)})`;

        switch (node.type) {
            case BasicType.SCALAR:
                return js`(typeof ${value} == 'boolean' || typeof ${value} == 'number || typeof ${value} == 'string')`;
            case BasicType.LIST:
                return js`Array.isArray(${value})`;
            case BasicType.OBJECT:
                return js`typeof ${value} == 'object' && ${value} != undefined && !Array.isArray(${value})`;
            case BasicType.NULL:
                return js`${value} == undefined`;
        }
    },

    Entities(node: EntitiesQueryNode, context): JSFragment {
        return getCollectionForType(node.objectType, context);
    },

    FollowEdge(node: FollowEdgeQueryNode, context): JSFragment {
        // TODO
        return js`[]`;
        /*const tmpVar = js.variable('node');
        // need to wrap this in a subquery because ANY is not possible as first token of an expression node in JS
        return jsExt.executingFunction(
            js`FOR ${tmpVar}`,
            js`IN ${getSimpleFollowEdgeFragment(node, context)}`,
            js`FILTER ${tmpVar} != null`,
            js`RETURN ${tmpVar}`
        );*/
    },

    CreateEntity(node: CreateEntityQueryNode, context): JSFragment {
        const objVar = js.variable('obj');
        const idVar = js.variable('id');
        return jsExt.executingFunction(
            js`const ${objVar} = ${processNode(node.objectNode, context)};`,
            js`const ${idVar} = db.generateID();`,
            js`${objVar}.${js.identifier(ID_FIELD_NAME)} = ${idVar};`,
            js`${js.collection(getCollectionNameForRootEntity(node.objectType))}.push(${objVar});`,
            js`return ${idVar};`
        );
    },

    UpdateEntities(node: UpdateEntitiesQueryNode, context) {
        const newContext = context.introduceVariable(node.currentEntityVariable);
        const entityVar = newContext.getVariable(node.currentEntityVariable);

        function lambda(inner: JSFragment) {
            return jsExt.lambda(entityVar, inner);
        }

        const updateFunction: JSFragment = jsExt.executingFunction(
            js`Object.assign(${entityVar}, ${processNode(new ObjectQueryNode(node.updates), newContext)});`,
            js`return ${entityVar}.${js.identifier(ID_FIELD_NAME)};`
        );

        return js.lines(
            js`${getCollectionForType(node.objectType, context)}`,
            js.indent(js.lines(
                js`.map(${lambda(processNode(node.filterNode, newContext))})`,
                node.maxCount != undefined ? js`.slice(0, ${node.maxCount}` : js``,
                js`.map(${lambda(updateFunction)})`
            ))
        );
    },

    DeleteEntities(node: DeleteEntitiesQueryNode, context) {
        const newContext = context.introduceVariable(node.currentEntityVariable);
        const entityVar = newContext.getVariable(node.currentEntityVariable);
        const listVar = js.variable('objectsToDelete');
        const coll = js.collection(getCollectionNameForRootEntity(node.objectType));
        const idsVar = js.variable('ids');

        return jsExt.executingFunction(
            js`const ${listVar} = ${getCollectionForType(node.objectType, context)}`,
            js.indent(js.lines(
                js`.map(${jsExt.lambda(entityVar, processNode(node.filterNode, newContext))})`,
                node.maxCount != undefined ? js`.slice(0, ${node.maxCount}` : js``
            )),
            js`const ${idsVar} = new Set(${listVar}.map(${jsExt.lambda(entityVar, js`${entityVar}.${js.identifier(ID_FIELD_NAME)}`)})`,
            js`${coll} = ${coll}.filter(${jsExt.lambda(entityVar, js`!${idsVar}.has(${entityVar}.${js.identifier(ID_FIELD_NAME)}`)});`,
            js`return ${listVar}`
        );
    },

    AddEdges(node: AddEdgesQueryNode, context) {
        return js`undefined`; // TODO
    },

    RemoveEdges(node: RemoveEdgesQueryNode, context) {
        return js`undefined`; // TODO
    },

    SetEdge(node: SetEdgeQueryNode, context) {
        return js`undefined`; // TODO
    }
};

function getJSOperator(op: BinaryOperator): JSFragment|undefined {
    switch (op) {
        case BinaryOperator.AND:
            return js`&&`;
        case BinaryOperator.OR:
            return js`||`;
        case BinaryOperator.EQUAL:
            return js`===`;
        case BinaryOperator.UNEQUAL:
            return js`!==`;
        case BinaryOperator.LESS_THAN:
            return js`<`;
        case BinaryOperator.LESS_THAN_OR_EQUAL:
            return js`<=`;
        case BinaryOperator.GREATER_THAN:
            return js`>`;
        case BinaryOperator.GREATER_THAN_OR_EQUAL:
            return js`>=`;
        case BinaryOperator.ADD:
            return js`+`;
        case BinaryOperator.SUBTRACT:
            return js`-`;
        case BinaryOperator.MULTIPLY:
            return js`*`;
        case BinaryOperator.DIVIDE:
            return js`/`;
        case BinaryOperator.MODULO:
            return js`%`;
        default:
            return undefined;
    }
}

function getComparatorForOrderSpecification(orderBy: OrderSpecification, itemVar: JSFragment, context: QueryContext) {
    const lhsVar = js.variable('lhs');
    const rhsVar = js.variable('rhs');

    function getComparisonStatementsForOrderClause(clause: OrderClause): JSFragment[] {
        const valueLambda = jsExt.lambda(itemVar, processNode(clause.valueNode, context));
        const lhsValueVar = js.variable('lhsVal');
        const rhsValueVar = js.variable('rhsVal');
        const smallerRetValue = clause.direction == OrderDirection.ASCENDING ? js`-1` : js`1`;
        const largerRetValue = clause.direction == OrderDirection.ASCENDING ? js`1` : js`-1`;
        return [
            js`const ${lhsValueVar} = (${valueLambda})(${lhsVar});`,
            js`const ${rhsValueVar} = (${valueLambda})(${rhsVar});`,
            js`if (${lhsValueVar} < ${rhsValueVar}) { `,
            js.indent(js`return ${smallerRetValue};`),
            js`}`,
            js`if (${lhsValueVar} > ${rhsValueVar}) {`,
            js.indent(js`return ${largerRetValue};`),
            js`}`
        ];
    }

    return js.lines(
        js`(function(${lhsVar}, ${rhsVar}) {`,
        js.indent(js.lines(
            ...flatMap(orderBy.clauses, clause => getComparisonStatementsForOrderClause(clause)),
            js`return 0;`
        )),
        js`})`
    );
}

const processorMap: {[name: string]: NodeProcessor<any>} = {};
for (const processorName in processors) {
    processorMap[processorName + 'QueryNode'] = processors[processorName];
}

function processNode(node: QueryNode, context: QueryContext): JSFragment {
    const type = node.constructor.name;
    if (!(type in processorMap)) {
        throw new Error(`Unsupported query type: ${type}`);
    }
    return processorMap[type](node, context);
}

// TODO I think JSCompoundQuery (JS transaction node) should not be the exported type
// we should rather export JSExecutableQuery[] (as JS transaction) directly.
export function getJSQuery(node: QueryNode): JSCompoundQuery {
    return createJSCompoundQuery(node, js.queryResultVariable('result'), undefined, new QueryContext());
}

function getCollectionForType(type: GraphQLNamedType, context: QueryContext) {
    const name = getCollectionNameForRootEntity(type);
    return js.collection(name);
}
