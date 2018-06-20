import { compact } from 'lodash';
import { Relation, RootEntityType } from '../../model';
import {
    AddEdgesQueryNode, BasicType, BinaryOperationQueryNode, BinaryOperator, ConcatListsQueryNode, ConditionalQueryNode,
    ConstBoolQueryNode, ConstIntQueryNode, CountQueryNode, CreateEntityQueryNode, DeleteEntitiesQueryNode,
    EntitiesQueryNode, EntityFromIdQueryNode, FieldQueryNode, FirstOfListQueryNode, FollowEdgeQueryNode, ListQueryNode,
    LiteralQueryNode, MergeObjectsQueryNode, ObjectQueryNode, OrderClause, OrderDirection, OrderSpecification,
    QueryNode, QueryResultValidator, RemoveEdgesQueryNode, RootEntityIDQueryNode, RUNTIME_ERROR_TOKEN,
    RuntimeErrorQueryNode, SetEdgeQueryNode, TransformListQueryNode, TypeCheckQueryNode, UnaryOperationQueryNode,
    UnaryOperator, UpdateEntitiesQueryNode, VariableAssignmentQueryNode, VariableQueryNode, WithPreExecutionQueryNode
} from '../../query-tree';
import { decapitalize } from '../../utils/utils';
import { getCollectionNameForRelation, getCollectionNameForRootEntity } from './inmemory-basics';
import { js, JSCompoundQuery, JSFragment, JSQueryResultVariable, JSVariable } from './js';

const ID_FIELD_NAME = 'id';

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
            resultVar = new JSQueryResultVariable(resultVariable.label);
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
        return js`${variable} => (${expression})`;
    }

    export function evaluatingLambda(variable: JSVariable, expression: JSFragment, value: JSFragment) {
        return js`(${jsExt.lambda(variable, expression)})(${value})`;
    }
}

const processors : { [name: string]: NodeProcessor<any> } = {
    Literal(node: LiteralQueryNode): JSFragment {
        return js`${node.value}`;
    },

    Null(): JSFragment {
        return js`null`;
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
        const listNodes = node.listNodes.map(node => js`...${processNode(node, context)}`);
        const listNodeStr = js.join(listNodes, js`, `);
        return js`[${listNodeStr}]`;
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
        const itemVariable = new VariableQueryNode(decapitalize(node.rootEntityType.name));
        return processNode(new FirstOfListQueryNode(new TransformListQueryNode({
            listNode: new EntitiesQueryNode(node.rootEntityType),
            itemVariable,
            filterNode: new BinaryOperationQueryNode(new RootEntityIDQueryNode(itemVariable), BinaryOperator.EQUAL, node.idNode)
        })), context);
    },

    Field(node: FieldQueryNode, context): JSFragment {
        const object = processNode(node.objectNode, context);
        const objectVar = js.variable('object');
        const identifier = jsExt.safeJSONKey(node.field.name);
        // always use [] access because we could collide with keywords
        // avoid undefined values because they cause trouble when being compared with === to null
        const raw = js`${identifier} in ${objectVar} ? ${objectVar}[${identifier}] : null`;

        // mimick arango behavior here which propagates null
        return jsExt.evaluatingLambda(objectVar, js`((typeof (${objectVar}) == 'object' && (${objectVar}) != null) ? (${raw}) : null)`, object);
    },

    RootEntityID(node: RootEntityIDQueryNode, context): JSFragment {
        return js`${processNode(node.objectNode, context)}.${js.identifier(ID_FIELD_NAME)}`;
    },

    TransformList(node: TransformListQueryNode, context): JSFragment {
        let itemContext = context.introduceVariable(node.itemVariable);
        const itemVar = itemContext.getVariable(node.itemVariable);

        function lambda(exprNode: QueryNode) {
            return jsExt.lambda(itemVar, processNode(exprNode, itemContext));
        }

        const comparator = node.orderBy.isUnordered() ? undefined : getComparatorForOrderSpecification(node.orderBy, itemVar, itemContext);
        const isFiltered = !(node.filterNode instanceof ConstBoolQueryNode) || node.filterNode.value != true;
        const isMapped = node.innerNode != node.itemVariable;

        let sliceClause;
        if (node.maxCount != undefined) {
            sliceClause = js`.slice(${node.skip}, ${node.skip + node.maxCount})`;
        } else if (node.skip > 0) {
            sliceClause = js`.slice(${node.skip})`;
        } else {
            sliceClause = js``;
        }

        return js.lines(
            processNode(node.listNode, context),
            js.indent(js.lines(
                isFiltered ? js`.filter(${lambda(node.filterNode)})` : js``,
                comparator ? js`.slice().sort(${comparator})` : js``, // need slice() to not replace something in-place
                sliceClause,
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
        const listVar = js.variable('list');
        return jsExt.evaluatingLambda(listVar, js`${listVar}.length ? ${listVar}[0] : null`, processNode(node.listNode, context));
    },

    BinaryOperation(node: BinaryOperationQueryNode, context): JSFragment {
        const lhs = processNode(node.lhs, context);
        const rhs = processNode(node.rhs, context);
        const lhsVar = js.variable('lhs');
        const rhsVar = js.variable('rhs');
        const lhsListOrString = jsExt.evaluatingLambda(lhsVar, js`(Array.isArray(${lhsVar}) ? ${lhsVar} : String(${lhsVar}))`, lhs);
        const rhsListOrString = jsExt.evaluatingLambda(rhsVar, js`(Array.isArray(${rhsVar}) ? ${rhsVar} : String(${rhsVar}))`, rhs);
        const op = getJSOperator(node.operator);
        if (op) {
            return js`(${lhs} ${op} ${rhs})`;
        }

        function compare(comp: JSFragment) {
            return js.lines(
                js`support.compare(`,
                js.indent(js.lines(
                    js`${lhs},`,
                    js`${rhs}`
                )),
                js`) ${comp} 0`
            );
        }

        switch (node.operator) {
            case BinaryOperator.LESS_THAN:
                return compare(js`<`);
            case BinaryOperator.LESS_THAN_OR_EQUAL:
                return compare(js`<=`);
            case BinaryOperator.GREATER_THAN:
                return compare(js`>`);
            case BinaryOperator.GREATER_THAN_OR_EQUAL:
                return compare(js`>=`);
            case BinaryOperator.CONTAINS:
                return js`${lhsListOrString}.includes(${rhsListOrString})`;
            case BinaryOperator.IN:
                return js`${rhsListOrString}.includes(${lhsListOrString})`;
            case BinaryOperator.STARTS_WITH:
                return js`String(${lhs}).startsWith(${rhs})`;
            case BinaryOperator.ENDS_WITH:
                return js`String(${lhs}).endsWith(${rhs})`;
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
        const valueVar = js.variable('value');

        switch (node.type) {
            case BasicType.SCALAR:
                return jsExt.evaluatingLambda(valueVar, js`(typeof ${valueVar} == 'boolean' || typeof ${valueVar} == 'number || typeof ${valueVar} == 'string')`, value);
            case BasicType.LIST:
                return js`Array.isArray(${value})`;
            case BasicType.OBJECT:
                return jsExt.evaluatingLambda(valueVar, js`typeof ${valueVar} == 'object' && ${valueVar} != null && !Array.isArray(${valueVar})`, value);
            case BasicType.NULL:
                return js`${value} == null`;
        }
    },

    Entities(node: EntitiesQueryNode, context): JSFragment {
        return getCollectionForType(node.rootEntityType, context);
    },

    FollowEdge(node: FollowEdgeQueryNode, context): JSFragment {
        const targetType = node.relationSide.targetType;
        const targetColl = getCollectionForType(targetType, context);
        const edgeColl = getCollectionForRelation(node.relationSide.relation, context);
        const edgeVar = js.variable('edge');
        const itemVar = js.variable(decapitalize(targetType.name));
        const sourceIDOnEdge = node.relationSide.isFromSide ? js`${edgeVar}._from` : js`${edgeVar}._to`;
        const targetIDOnEdge = node.relationSide.isFromSide ? js`${edgeVar}._to` : js`${edgeVar}._from`;
        const sourceID = processNode(new RootEntityIDQueryNode(node.sourceEntityNode), context);
        const idOnItem = js`${itemVar}.${js.identifier(ID_FIELD_NAME)}`;
        const idOnItemEqualsTargetIDOnEdge = js`${idOnItem} === ${targetIDOnEdge}`;

        return js.lines(
            js`${edgeColl}`,
            js.indent(js.lines(
                js`.filter(${jsExt.lambda(edgeVar, js`${sourceIDOnEdge} == ${sourceID}`)})`,
                js`.map(${jsExt.lambda(edgeVar, js`${targetColl}.find(${jsExt.lambda(itemVar, idOnItemEqualsTargetIDOnEdge)})`)})`,
                js`.filter(${jsExt.lambda(itemVar, itemVar)})` // filter out nulls
            ))
        );
    },

    CreateEntity(node: CreateEntityQueryNode, context): JSFragment {
        const objVar = js.variable('obj');
        const idVar = js.variable('id');
        return jsExt.executingFunction(
            js`const ${objVar} = ${processNode(node.objectNode, context)};`,
            js`const ${idVar} = db.generateID();`,
            js`${objVar}.${js.identifier(ID_FIELD_NAME)} = ${idVar};`,
            js`${js.collection(getCollectionNameForRootEntity(node.rootEntityType))}.push(${objVar});`,
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
            js`${processNode(node.listNode, context)}`,
            js.indent(js.lines(
                js`.map(${lambda(updateFunction)})`
            ))
        );
    },

    DeleteEntities(node: DeleteEntitiesQueryNode, context) {
        const entityVar = js.variable(decapitalize(node.rootEntityType.name));
        const listVar = js.variable('objectsToDelete');
        const coll = js.collection(getCollectionNameForRootEntity(node.rootEntityType));
        const idsVar = js.variable('ids');

        return jsExt.executingFunction(
            js`const ${listVar} = ${processNode(node.listNode, context)}`,
            js`const ${idsVar} = new Set(${listVar}.map(${jsExt.lambda(entityVar, js`${entityVar}.${js.identifier(ID_FIELD_NAME)}`)}));`,
            js`${coll} = ${coll}.filter(${jsExt.lambda(entityVar, js`!${idsVar}.has(${entityVar}.${js.identifier(ID_FIELD_NAME)}`)}));`,
            js`return ${listVar};`
        );
    },

    AddEdges(node: AddEdgesQueryNode, context) {
        const coll = getCollectionForRelation(node.relation, context);

        const edgesJS = js.lines(
            js`[`,
            js.indent(js.join(node.edges.map(edge => js`{ _from: ${processNode(edge.fromIDNode, context)}, _to: ${processNode(edge.toIDNode, context)} }`), js`,\n`)),
            js`]`
        );

        function edgeExists(edge: JSFragment) {
            const edgeVar = js.variable('edge');
            return js`${coll}.some(${jsExt.lambda(edgeVar, js`${edgeVar}._from == ${edge}._from && ${edgeVar}._to === ${edge}._to`)})`;
        }

        const toAdd = js.variable(`toAdd`);
        return js`${edgesJS}.forEach(${jsExt.lambda(toAdd, js`${edgeExists(toAdd)} ? undefined : ${coll}.push(${toAdd})`)})`;
    },

    RemoveEdges(node: RemoveEdgesQueryNode, context): JSFragment {
        const coll = getCollectionForRelation(node.relation, context);
        const edgeVar = js.variable('edge');
        const fromIDs = node.edgeFilter.fromIDNodes ? js.join(node.edgeFilter.fromIDNodes.map(node => processNode(node, context)), js`, `) : undefined;
        const toIDs = node.edgeFilter.toIDNodes ? js.join(node.edgeFilter.toIDNodes.map(node => processNode(node, context)), js`, `) : undefined;
        const edgeRemovalCriteria = compact([
            fromIDs ? js`[${fromIDs}].includes(${edgeVar}._from)` : undefined,
            toIDs ? js`[${toIDs}].includes(${edgeVar}._to)` : undefined
        ]);
        const edgeShouldStay = js`!(${js.join(edgeRemovalCriteria, js` && `)})`;

        return jsExt.executingFunction(
            js`${coll} = ${coll}.filter(${jsExt.lambda(edgeVar, edgeShouldStay)});`,
        );
    },

    SetEdge(node: SetEdgeQueryNode, context): JSFragment {
        const coll = getCollectionForRelation(node.relation, context);
        const edgeVar = js.variable('edge');
        const edgeRemovalCriteria = compact([
            node.existingEdge.fromIDNode ? js`${edgeVar}._from == ${processNode(node.existingEdge.fromIDNode, context)}` : undefined,
            node.existingEdge.toIDNode ? js`${edgeVar}._to == ${processNode(node.existingEdge.toIDNode, context)}` : undefined
        ]);
        const edgeShouldStay = js`!(${js.join(edgeRemovalCriteria, js` && `)})`;

        return jsExt.executingFunction(
            js`${coll} = ${coll}.filter(${jsExt.lambda(edgeVar, edgeShouldStay)});`,
            js`${coll}.push({ _from: ${processNode(node.newEdge.fromIDNode, context)}, _to: ${processNode(node.newEdge.toIDNode, context)} });`
        );
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
    function getClauseFnAndInvert(clause: OrderClause): JSFragment {
        const valueLambda = jsExt.lambda(itemVar, processNode(clause.valueNode, context));
        return js`[${valueLambda}, ${clause.direction == OrderDirection.DESCENDING ? js`true` : js`false`}]`;
    }
    const args = orderBy.clauses.map(clause => getClauseFnAndInvert(clause));

    return js`support.getMultiComparator(${js.join(args, js`, `)})`;
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

function getCollectionForType(type: RootEntityType, context: QueryContext) {
    const name = getCollectionNameForRootEntity(type);
    return js.collection(name);
}

function getCollectionForRelation(relation: Relation, context: QueryContext) {
    const name = getCollectionNameForRelation(relation);
    return js.collection(name);
}
