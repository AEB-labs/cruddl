import { compact } from 'lodash';
import { IDENTITY_ANALYZER, NORM_CI_ANALYZER } from '../../model/implementation/flex-search';
import { AggregationOperator, Relation, RelationSide, RootEntityType } from '../../model';
import {
    AddEdgesQueryNode,
    AggregationQueryNode,
    BasicType,
    BinaryOperationQueryNode,
    BinaryOperator,
    BinaryOperatorWithAnalyzer,
    ConcatListsQueryNode,
    ConditionalQueryNode,
    ConfirmForBillingQueryNode,
    ConstBoolQueryNode,
    ConstIntQueryNode,
    CountQueryNode,
    CreateBillingEntityQueryNode,
    CreateEntitiesQueryNode,
    CreateEntityQueryNode,
    DeleteEntitiesQueryNode,
    DynamicPropertyAccessQueryNode,
    EntitiesIdentifierKind,
    EntitiesQueryNode,
    EntityFromIdQueryNode,
    FieldPathQueryNode,
    FieldQueryNode,
    FirstOfListQueryNode,
    FlexSearchStartsWithQueryNode,
    FollowEdgeQueryNode,
    ListItemQueryNode,
    ListQueryNode,
    LiteralQueryNode,
    MergeObjectsQueryNode,
    NullQueryNode,
    ObjectEntriesQueryNode,
    ObjectQueryNode,
    OperatorWithAnalyzerQueryNode,
    OrderClause,
    OrderDirection,
    OrderSpecification,
    PropertyAccessQueryNode,
    QueryNode,
    QueryResultValidator,
    RemoveEdgesQueryNode,
    RootEntityIDQueryNode,
    RUNTIME_ERROR_CODE_PROPERTY,
    RUNTIME_ERROR_TOKEN,
    RuntimeErrorQueryNode,
    SafeListQueryNode,
    SetEdgeQueryNode,
    TransformListQueryNode,
    TraversalQueryNode,
    TypeCheckQueryNode,
    UnaryOperationQueryNode,
    UnaryOperator,
    UpdateChildEntitiesQueryNode,
    UpdateEntitiesQueryNode,
    VariableAssignmentQueryNode,
    VariableQueryNode,
    WithPreExecutionQueryNode,
} from '../../query-tree';
import {
    FlexSearchComplexOperatorQueryNode,
    FlexSearchFieldExistsQueryNode,
    FlexSearchQueryNode,
} from '../../query-tree/flex-search';
import { QuantifierFilterNode } from '../../query-tree/quantifiers';
import { createFieldPathNode } from '../../schema-generation/field-path-node';
import { not } from '../../schema-generation/utils/input-types';
import { Constructor, decapitalize } from '../../utils/utils';
import { likePatternToRegExp } from '../like-helpers';
import { getCollectionNameForRelation, getCollectionNameForRootEntity } from './inmemory-basics';
import { js, JSCompoundQuery, JSFragment, JSQueryResultVariable, JSVariable } from './js';
import { Clock, DefaultClock, IDGenerator, UUIDGenerator } from '../../execution/execution-options';

const ID_FIELD_NAME = 'id';

export interface QueryGenerationOptions {
    /**
     * An interface to determine the current date/time
     */
    readonly clock: Clock;

    /**
     * An interface to generate IDs, e.g. for new child entities.
     */
    readonly idGenerator: IDGenerator;
}

class QueryContext {
    private variableMap = new Map<VariableQueryNode, JSVariable>();
    private preExecQueries: JSCompoundQuery[] = [];

    constructor(
        /**
         * Options that do not change within one query tree
         */
        readonly options: QueryGenerationOptions,
    ) {}

    /**
     * Creates a new QueryContext with an independent variable map except that all query result variables of this
     * context are available.
     */
    private newPreExecContext(): QueryContext {
        const newContext = new QueryContext(this.options);
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
    private newNestedContextWithNewVariable(
        variableNode: VariableQueryNode,
        jsVariable: JSVariable,
    ): QueryContext {
        if (this.variableMap.has(variableNode)) {
            throw new Error(`Variable ${variableNode} is introduced twice`);
        }
        const newContext = new QueryContext(this.options);
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
    addPreExecuteQuery(
        preExecQuery: QueryNode,
        resultVariable?: VariableQueryNode,
        resultValidator?: QueryResultValidator,
    ): QueryContext {
        let resultVar: JSQueryResultVariable | undefined;
        let newContext: QueryContext;
        if (resultVariable) {
            resultVar = new JSQueryResultVariable(resultVariable.label);
            newContext = this.newNestedContextWithNewVariable(resultVariable, resultVar);
        } else {
            resultVar = undefined;
            newContext = this;
        }

        const jsQuery = createJSCompoundQuery(
            preExecQuery,
            resultVar,
            resultValidator,
            this.newPreExecContext(),
        );

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

    getPreExecuteQueries(): ReadonlyArray<JSCompoundQuery> {
        return this.preExecQueries;
    }
}

function createJSCompoundQuery(
    node: QueryNode,
    resultVariable: JSQueryResultVariable | undefined,
    resultValidator: QueryResultValidator | undefined,
    context: QueryContext,
): JSCompoundQuery {
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

    export function executingFunction(...content: ReadonlyArray<JSFragment>): JSFragment {
        return js.lines(js`(function() {`, js.indent(js.lines(...content)), js`})()`);
    }

    export function lambda(variable: JSVariable, expression: JSFragment) {
        return js`${variable} => (${expression})`;
    }

    export function evaluatingLambda(
        variable: JSVariable,
        expression: JSFragment,
        value: JSFragment,
    ) {
        return js`(${jsExt.lambda(variable, expression)})(${value})`;
    }
}

const processors = new Map<Constructor<QueryNode>, NodeProcessor<QueryNode>>();

function register<T extends QueryNode>(type: Constructor<T>, processor: NodeProcessor<T>) {
    processors.set(type, processor as NodeProcessor<QueryNode>); // probably some bivariancy issue
}

register(LiteralQueryNode, (node) => {
    return js.value(node.value);
});

register(NullQueryNode, () => {
    return js`null`;
});

register(RuntimeErrorQueryNode, (node) => {
    const runtimeErrorToken = js.code(RUNTIME_ERROR_TOKEN);
    if (node.code) {
        const codeProp = js.code(RUNTIME_ERROR_CODE_PROPERTY);
        return js`{ ${codeProp}: ${node.code}, ${runtimeErrorToken}: ${node.message} }`;
    }
    return js`{ ${runtimeErrorToken}: ${node.message} }`;
});

register(ConstBoolQueryNode, (node) => {
    return node.value ? js`true` : js`false`;
});

register(ConstIntQueryNode, (node) => {
    return js.integer(node.value);
});

register(ObjectQueryNode, (node, context) => {
    if (!node.properties.length) {
        return js`{}`;
    }

    const properties = node.properties.map(
        (p) => js`${jsExt.safeJSONKey(p.propertyName)}: ${processNode(p.valueNode, context)}`,
    );
    return js.lines(js`{`, js.indent(js.join(properties, js`,\n`)), js`}`);
});

register(ListQueryNode, (node, context) => {
    if (!node.itemNodes.length) {
        return js`[]`;
    }

    return js.lines(
        js`[`,
        js.indent(
            js.join(
                node.itemNodes.map((itemNode) => processNode(itemNode, context)),
                js`,\n`,
            ),
        ),
        js`]`,
    );
});

register(ConcatListsQueryNode, (node, context) => {
    const listNodes = node.listNodes.map((node) => js`...${processNode(node, context)}`);
    const listNodeStr = js.join(listNodes, js`, `);
    return js`[${listNodeStr}]`;
});

register(VariableQueryNode, (node, context) => {
    return context.getVariable(node);
});

register(VariableAssignmentQueryNode, (node, context) => {
    const newContext = context.introduceVariable(node.variableNode);
    const tmpVar = newContext.getVariable(node.variableNode);

    return jsExt.executingFunction(
        js`const ${tmpVar} = ${processNode(node.variableValueNode, newContext)};`,
        js`return ${processNode(node.resultNode, newContext)}`,
    );
});

register(WithPreExecutionQueryNode, (node, context) => {
    let currentContext = context;
    for (const preExecParm of node.preExecQueries) {
        currentContext = currentContext.addPreExecuteQuery(
            preExecParm.query,
            preExecParm.resultVariable,
            preExecParm.resultValidator,
        );
    }

    return js`${processNode(node.resultNode, currentContext)}`;
});

register(EntityFromIdQueryNode, (node, context) => {
    const itemVariable = new VariableQueryNode(decapitalize(node.rootEntityType.name));
    return processNode(
        new FirstOfListQueryNode(
            new TransformListQueryNode({
                listNode: new EntitiesQueryNode(node.rootEntityType),
                itemVariable,
                filterNode: new BinaryOperationQueryNode(
                    new RootEntityIDQueryNode(itemVariable),
                    BinaryOperator.EQUAL,
                    node.idNode,
                ),
            }),
        ),
        context,
    );
});

register(FieldQueryNode, (node, context) => {
    const object = processNode(node.objectNode, context);
    return getPropertyAccessFrag(node.field.name, object);
});

register(PropertyAccessQueryNode, (node, context) => {
    const object = processNode(node.objectNode, context);
    return getPropertyAccessFrag(node.propertyName, object);
});

function getPropertyAccessFrag(propertyName: string, objectFrag: JSFragment) {
    const objectVar = js.variable('object');
    const identifier = jsExt.safeJSONKey(propertyName);
    // always use [] access because we could collide with keywords
    // avoid undefined values because they cause trouble when being compared with === to null
    const raw = js`${identifier} in ${objectVar} ? ${objectVar}[${identifier}] : null`;

    // mimick arango behavior here which propagates null
    return jsExt.evaluatingLambda(
        objectVar,
        js`((typeof (${objectVar}) == 'object' && (${objectVar}) != null) ? (${raw}) : null)`,
        objectFrag,
    );
}

register(DynamicPropertyAccessQueryNode, (node, context) => {
    const objectFrag = processNode(node.objectNode, context);
    const objectVar = js.variable('object');
    const keyFrag = processNode(node.propertyNode, context);
    // always use [] access because we could collide with keywords
    // avoid undefined values because they cause trouble when being compared with === to null
    const raw = js`${keyFrag} in ${objectVar} ? ${objectVar}[${keyFrag}] : null`;

    // mimick arango behavior here which propagates null
    return jsExt.evaluatingLambda(
        objectVar,
        js`((typeof (${objectVar}) == 'object' && (${objectVar}) != null) ? (${raw}) : null)`,
        objectFrag,
    );
});

register(RootEntityIDQueryNode, (node, context) => {
    return getPropertyAccessFrag('id', processNode(node.objectNode, context));
});

register(TransformListQueryNode, (node, context) => {
    let itemContext = context.introduceVariable(node.itemVariable);
    const itemVar = itemContext.getVariable(node.itemVariable);

    function lambda(exprNode: QueryNode) {
        return jsExt.lambda(itemVar, processNode(exprNode, itemContext));
    }

    const comparator = node.orderBy.isUnordered()
        ? undefined
        : getComparatorForOrderSpecification(node.orderBy, itemVar, itemContext);
    const isFiltered =
        !(node.filterNode instanceof ConstBoolQueryNode) || node.filterNode.value != true;
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
        js.indent(
            js.lines(
                isFiltered ? js`.filter(${lambda(node.filterNode)})` : js``,
                comparator ? js`.slice().sort(${comparator})` : js``, // need slice() to not replace something in-place
                sliceClause,
                isMapped ? js`.map(${lambda(node.innerNode)})` : js``,
            ),
        ),
    );
});

register(CountQueryNode, (node, context) => {
    // in arangodb LENGTH(null) is 0, which can be useful sometimes, so let's just mimick the behavior
    return js`(${processNode(node.listNode, context)}?.length ?? 0)`;
});

register(AggregationQueryNode, (node, context) => {
    const itemVar = js.variable('item');
    const indexVar = js.variable('index');
    const accumulatorVar = js.variable('acc');
    const listFrag = processNode(node.listNode, context);
    const listVar = js.variable('list');

    const listWithoutNullsFrag = js`${listFrag}.filter(${itemVar} => ${itemVar} != null)`;

    switch (node.operator) {
        case AggregationOperator.SUM:
            return js`${listWithoutNullsFrag}.reduce((${itemVar}, ${accumulatorVar}) => ${accumulatorVar} + ${itemVar}, 0)`;
        case AggregationOperator.AVERAGE:
            return jsExt.evaluatingLambda(
                listVar,
                js`${listVar}.length ? (${listVar}.reduce((${itemVar}, ${accumulatorVar}) => ${accumulatorVar} + ${itemVar}) / ${listVar}.length) : null`,
                listWithoutNullsFrag,
            );
        case AggregationOperator.MIN:
            return js`support.min(${listWithoutNullsFrag})`;
        case AggregationOperator.MAX:
            return js`support.max(${listWithoutNullsFrag})`;
        case AggregationOperator.SOME_TRUE:
            return js`${listFrag}.some(${jsExt.lambda(itemVar, itemVar)})`;
        case AggregationOperator.SOME_NOT_TRUE:
            return js`${listFrag}.some(${jsExt.lambda(itemVar, js`!${itemVar}`)})`;
        case AggregationOperator.EVERY_TRUE:
            return js`${listFrag}.every(${jsExt.lambda(itemVar, itemVar)})`;
        case AggregationOperator.NONE_TRUE:
            return js`(!${listFrag}.some(${jsExt.lambda(itemVar, itemVar)}))`;
        case AggregationOperator.COUNT_TRUE:
            return js`${listFrag}.filter(${jsExt.lambda(itemVar, itemVar)}).length`;
        case AggregationOperator.COUNT_NOT_TRUE:
            return js`${listFrag}.filter(${jsExt.lambda(itemVar, js`!${itemVar}`)}).length`;
        case AggregationOperator.SOME_NULL:
            return js`${listFrag}.some(${jsExt.lambda(itemVar, js`${itemVar} == null`)})`;
        case AggregationOperator.SOME_NOT_NULL:
            return js`${listFrag}.some(${jsExt.lambda(itemVar, js`${itemVar} != null`)})`;
        case AggregationOperator.EVERY_NULL:
            return js`${listFrag}.every(${jsExt.lambda(itemVar, js`${itemVar} == null`)})`;
        case AggregationOperator.NONE_NULL:
            return js`${listFrag}.every(${jsExt.lambda(itemVar, js`${itemVar} != null`)})`;
        case AggregationOperator.COUNT_NULL:
            return js`${listFrag}.filter(${jsExt.lambda(itemVar, js`${itemVar} == null`)}).length`;
        case AggregationOperator.COUNT_NOT_NULL:
            return js`${listFrag}.filter(${jsExt.lambda(itemVar, js`${itemVar} != null`)}).length`;
        case AggregationOperator.COUNT:
            return js`${listFrag}.length`;
        case AggregationOperator.SOME:
            return js`(!!${listFrag}.length)`;
        case AggregationOperator.NONE:
            return js`(!${listFrag}.length)`;

        // these should also remove null values by definition
        case AggregationOperator.DISTINCT:
            const innerVar = js.variable();
            const list = jsExt.evaluatingLambda(
                listVar,
                js`${listVar}.filter((${itemVar}, ${indexVar}) => (${itemVar} != null && ${listVar}.findIndex(${innerVar} => JSON.stringify(${itemVar}) === JSON.stringify(${innerVar})) === ${indexVar}))`,
                listWithoutNullsFrag,
            );
            if (node.sort) {
                return js`${list}.sort(support.compare)`;
            }
            return list;
        case AggregationOperator.COUNT_DISTINCT:
            return jsExt.evaluatingLambda(
                listVar,
                js`${listVar}.filter((${itemVar}, ${indexVar}) => (${itemVar} != null && ${listVar}.indexOf(${itemVar}) === ${indexVar})).length`,
                listWithoutNullsFrag,
            );
        default:
            throw new Error(`Unsupported aggregation operator: ${(node as any).operator}`);
    }
});

register(UpdateChildEntitiesQueryNode, (node, context) => {
    if (!node.updates.length) {
        // optimization, and we later rely on updates.length >= 1
        return processNode(node.originalList, context);
    }

    const itemsVar = js.variable('items');
    const childContext = context.introduceVariable(node.dictionaryVar);
    const dictVar = childContext.getVariable(node.dictionaryVar);
    const updatedDictVar = js.variable('updatedDict');
    const itemVar = js.variable('item');
    const indexVar = js.variable('indexVar');

    // this is deliberately close to the aql implementation

    return jsExt.executingFunction(
        // could be a complex expression, and we're using it multiple times -> store in a variable
        js`const ${itemsVar} = ${processNode(node.originalList, context)}`,

        // the aql implementation needs an __index property to sort the object after applying
        // the updates. the js implementation does not need to sort because {...obj, a: ...}
        // keeps the order of properties in obj. However, we still need to filter out updates
        // for which there are no items in originalList. To stay close to the aql implementation,
        // we just also set an __index here.
        // regular field names cannot start with an underscore, so we're safe to use __index as a
        // temporary property to store the index of the child entity in the list
        // convert the list into a dict object like { 'id1': { ...}, 'id2': { ... } }
        // this allows us to efficiently look up individual objects (to avoid quadratic runtime)
        js`const ${dictVar} = Object.fromEntries(`,
        js.indent(
            js.lines(
                js`${itemsVar}.map((${itemVar}, ${indexVar}) => [`,
                js.indent(
                    js.lines(
                        // id as key, item with __index as value
                        js`${itemVar}.id,`,
                        js`{ ...${itemVar}, __index: ${indexVar} }`,
                    ),
                ),
                js`])`,
            ),
        ),
        js`);`,

        // merging the updated items into the dict to remove the old versions of the updated items
        js`const ${updatedDictVar} = {`,
        js.indent(
            js.lines(
                js`...${dictVar},`,
                ...node.updates.map((update): JSFragment => {
                    const idFrag = processNode(update.idNode, childContext);
                    // we're expecting the newChildEntityNode to merge the untouched properties of
                    // the old item, including __index
                    // using [idFrag] because it's a bound value, not an identifier
                    const valueFrag = processNode(update.newChildEntityNode, childContext);
                    return js`[${idFrag}]: ${valueFrag},`;
                }),
            ),
        ),
        js`};`,

        // filter out objects that were included in node.updates() but did not actually exist in node.originalList
        // (for them, __index is not set)
        // and unpack the dictionary into a list again
        js`return Object.values(${updatedDictVar}).filter(({ __index }) => __index !== undefined).map(({ __index, ...${itemVar} }) => ${itemVar});`,
    );
});

register(MergeObjectsQueryNode, (node, context) => {
    const objectList = node.objectNodes.map((node) => processNode(node, context));
    const objectsFragment = js.join(objectList, js`, `);
    return js`Object.assign({}, ${objectsFragment})`;
});

register(ObjectEntriesQueryNode, (node, context) => {
    const objVar = js.variable('object');
    return jsExt.evaluatingLambda(
        objVar,
        js`(${objVar} && typeof ${objVar} === 'object') ? Object.entries(${objVar}) : []`,
        processNode(node.objectNode, context),
    );
});

register(FirstOfListQueryNode, (node, context) => {
    const listVar = js.variable('list');
    return jsExt.evaluatingLambda(
        listVar,
        js`${listVar}.length ? ${listVar}[0] : null`,
        processNode(node.listNode, context),
    );
});

register(ListItemQueryNode, (node, context) => {
    const listVar = js.variable('list');
    return jsExt.evaluatingLambda(
        listVar,
        js`${listVar}.length > ${node.index} ? ${listVar}[${node.index}] : null`,
        processNode(node.listNode, context),
    );
});

register(BinaryOperationQueryNode, (node, context) => {
    const lhs = processNode(node.lhs, context);
    const rhs = processNode(node.rhs, context);
    const lhsVar = js.variable('lhs');
    const rhsVar = js.variable('rhs');
    const lhsListOrString = jsExt.evaluatingLambda(
        lhsVar,
        js`(Array.isArray(${lhsVar}) ? ${lhsVar} : String(${lhsVar}))`,
        lhs,
    );
    const rhsListOrString = jsExt.evaluatingLambda(
        rhsVar,
        js`(Array.isArray(${rhsVar}) ? ${rhsVar} : String(${rhsVar}))`,
        rhs,
    );
    const op = getJSOperator(node.operator);
    if (op) {
        return js`(${lhs} ${op} ${rhs})`;
    }

    switch (node.operator) {
        case BinaryOperator.LESS_THAN:
            return compare(js`<`, lhs, rhs);
        case BinaryOperator.LESS_THAN_OR_EQUAL:
            return compare(js`<=`, lhs, rhs);
        case BinaryOperator.GREATER_THAN:
            return compare(js`>`, lhs, rhs);
        case BinaryOperator.GREATER_THAN_OR_EQUAL:
            return compare(js`>=`, lhs, rhs);
        case BinaryOperator.CONTAINS:
            return js`${lhsListOrString}.includes(${rhs})`;
        case BinaryOperator.IN:
            return js`${rhsListOrString}.includes(${lhs})`;
        case BinaryOperator.STARTS_WITH:
            return js`String(${lhs}).startsWith(${rhs})`;
        case BinaryOperator.ENDS_WITH:
            return js`String(${lhs}).endsWith(${rhs})`;
        case BinaryOperator.LIKE:
            if (node.rhs instanceof LiteralQueryNode && typeof node.rhs.value === 'string') {
                const regexp = likePatternToRegExp(node.rhs.value);
                return js`!!String(${lhs}).match(${js.value(regexp)})`;
            }
            return js`!!String(${lhs}).match(support.likePatternToRegExp(${rhs})`;
        case BinaryOperator.APPEND: // TODO would not work for lists, is this neccessary?
            return js`String(${lhs}) + String(${rhs})`;
        case BinaryOperator.PREPEND:
            return js`String(${rhs}) + String(${lhs})`;
        case BinaryOperator.SUBTRACT_LISTS:
            const itemVar = js.variable('item');
            return js`(${lhs}).filter(${itemVar} => !${rhs}.includes(${itemVar}))`;
        default:
            throw new Error(`Unsupported binary operator: ${op}`);
    }
});

register(UnaryOperationQueryNode, (node, context) => {
    switch (node.operator) {
        case UnaryOperator.NOT:
            return js`!(${processNode(node.valueNode, context)})`;
        case UnaryOperator.JSON_STRINGIFY:
            return js`JSON.stringify(${processNode(node.valueNode, context)})`;
        case UnaryOperator.ROUND:
            return js`Math.round(${processNode(node.valueNode, context)})`;
        default:
            throw new Error(`Unsupported unary operator: ${node.operator}`);
    }
});

register(ConditionalQueryNode, (node, context) => {
    const cond = processNode(node.condition, context);
    const expr1 = processNode(node.expr1, context);
    const expr2 = processNode(node.expr2, context);
    return js`(${cond} ? ${expr1} : ${expr2})`;
});

register(TypeCheckQueryNode, (node, context) => {
    const value = js`(${processNode(node.valueNode, context)})`;
    const valueVar = js.variable('value');

    switch (node.type) {
        case BasicType.SCALAR:
            return jsExt.evaluatingLambda(
                valueVar,
                js`(typeof ${valueVar} == 'boolean' || typeof ${valueVar} == 'number || typeof ${valueVar} == 'string')`,
                value,
            );
        case BasicType.LIST:
            return js`Array.isArray(${value})`;
        case BasicType.OBJECT:
            return jsExt.evaluatingLambda(
                valueVar,
                js`typeof ${valueVar} == 'object' && ${valueVar} != null && !Array.isArray(${valueVar})`,
                value,
            );
        case BasicType.NULL:
            return js`${value} == null`;
    }
});

register(SafeListQueryNode, (node, context) => {
    const reducedNode = new ConditionalQueryNode(
        new TypeCheckQueryNode(node.sourceNode, BasicType.LIST),
        node.sourceNode,
        ListQueryNode.EMPTY,
    );
    return processNode(reducedNode, context);
});

register(QuantifierFilterNode, (node, context) => {
    let { quantifier, conditionNode, listNode, itemVariable } = node;

    // reduce 'every' to 'none' so that count-based evaluation is possible
    if (quantifier === 'every') {
        quantifier = 'none';
        conditionNode = not(conditionNode);
    }

    const filteredListNode = new TransformListQueryNode({
        listNode,
        filterNode: conditionNode,
        itemVariable,
    });

    const finalNode = new BinaryOperationQueryNode(
        new CountQueryNode(filteredListNode),
        quantifier === 'none' ? BinaryOperator.EQUAL : BinaryOperator.GREATER_THAN,
        new LiteralQueryNode(0),
    );
    return processNode(finalNode, context);
});

register(EntitiesQueryNode, (node, context) => {
    return getCollectionForType(node.rootEntityType, context);
});

register(FollowEdgeQueryNode, (node, context) => {
    const sourceID = processNode(new RootEntityIDQueryNode(node.sourceEntityNode), context);
    return getFollowEdgeFragment(node.relationSide, sourceID, context);
});

function getFollowEdgeFragment(
    relationSide: RelationSide,
    sourceIDFrag: JSFragment,
    context: QueryContext,
): JSFragment {
    const targetType = relationSide.targetType;
    const targetColl = getCollectionForType(targetType, context);
    const edgeColl = getCollectionForRelation(relationSide.relation, context);
    const edgeVar = js.variable('edge');
    const itemVar = js.variable(decapitalize(targetType.name));
    const sourceIDOnEdge = relationSide.isFromSide ? js`${edgeVar}._from` : js`${edgeVar}._to`;
    const targetIDOnEdge = relationSide.isFromSide ? js`${edgeVar}._to` : js`${edgeVar}._from`;
    const idOnItem = js`${itemVar}.${js.identifier(ID_FIELD_NAME)}`;
    const idOnItemEqualsTargetIDOnEdge = js`${idOnItem} === ${targetIDOnEdge}`;

    return js.lines(
        js`${edgeColl}`,
        js.indent(
            js.lines(
                js`.filter(${jsExt.lambda(edgeVar, js`${sourceIDOnEdge} == ${sourceIDFrag}`)})`,
                js`.map(${jsExt.lambda(
                    edgeVar,
                    js`${targetColl}.find(${jsExt.lambda(itemVar, idOnItemEqualsTargetIDOnEdge)})`,
                )})`,
                js`.filter(${jsExt.lambda(itemVar, itemVar)})`, // filter out nulls
            ),
        ),
    );
}

register(TraversalQueryNode, (node, context) => {
    let currentFrag: JSFragment = processNode(node.sourceEntityNode, context);
    let isList = node.sourceIsList;
    let isAlreadyID = node.entitiesIdentifierKind === EntitiesIdentifierKind.ID;

    if (
        !node.relationSegments.length &&
        node.entitiesIdentifierKind !== EntitiesIdentifierKind.ENTITY
    ) {
        throw new Error(`Only ENTITY identifiers supported without relationSegments`);
    }

    let segmentIndex = 0;
    for (const segment of node.relationSegments) {
        if (segment.vertexFilter) {
            throw new Error(
                `@collect with accessGroup restrictions is not supported by InMemoryAdapter`,
            );
        }

        const nodeVar = js.variable('node');
        const idFrag = isAlreadyID ? nodeVar : js`${nodeVar}.${js.identifier(ID_FIELD_NAME)}`;
        if (isList) {
            const accVar = js.variable('acc');
            let edgeListFragment = js`${nodeVar} ? ${getFollowEdgeFragment(
                segment.relationSide,
                idFrag,
                context,
            )} : null`;
            if (
                !segment.isListSegment &&
                (!node.alwaysProduceList || segmentIndex < node.relationSegments.length - 1)
            ) {
                // to-1 relations can be nullable and we need to keep the NULL values (and not just pretend the source didn't exist)
                const edgeListVar = js.variable('edges');
                edgeListFragment = jsExt.evaluatingLambda(
                    edgeListVar,
                    js`${edgeListVar}.length ? ${edgeListVar} : [null]`,
                    edgeListFragment,
                );
            }
            const reducer = js`(${accVar}, ${nodeVar}) => ${accVar}.concat(${edgeListFragment})`;
            currentFrag = js`${currentFrag}.reduce(${reducer}, [])`;
        } else {
            currentFrag = jsExt.evaluatingLambda(
                nodeVar,
                js`${nodeVar} ? ${getFollowEdgeFragment(
                    segment.relationSide,
                    idFrag,
                    context,
                )} : null`,
                currentFrag,
            );
            if (!segment.isListSegment) {
                // to-1 relations can be nullable and we need to keep the NULL values (and not just pretend the source didn't exist)
                currentFrag = js`(${currentFrag}[0] || null)`;
            }
        }

        if (segment.minDepth !== 1 || segment.maxDepth !== 1) {
            throw new Error(`Traversal with min/max depth is not supported by InMemoryAdapter`);
        }

        if (segment.isListSegment) {
            isList = true;
        }
        segmentIndex++;
    }

    // if we need to capture the root, do this (pseudo-code)
    // source.rel1.flatMap(o => o.rel2).flatMap(o2 => o2.rel3).flatMap(root => { root, obj: root.field1.flatMap(o => o.field2)  })
    // if the relations don't return a list, call the mapper directly

    const relationTraversalReturnsList = isList;
    let rootVar: JSVariable | undefined;
    let relationFrag: JSFragment | undefined;

    for (const segment of node.fieldSegments) {
        if (isList) {
            if (segment.isListSegment) {
                const nodeVar = js.variable('node');
                const accVar = js.variable('acc');
                const safeListVar = js.variable('list');
                // || [] to not concat `null` to a list
                const reducer = js`(${accVar}, ${nodeVar}) => ${accVar}.concat(${getPropertyAccessFrag(
                    segment.field.name,
                    nodeVar,
                )} || [])`;
                currentFrag = jsExt.evaluatingLambda(
                    safeListVar,
                    js`${safeListVar}.reduce(${reducer}, [])`,
                    js`${currentFrag} || []`,
                );
            } else {
                const nodeVar = js.variable('node');
                const mapper = jsExt.lambda(
                    nodeVar,
                    getPropertyAccessFrag(segment.field.name, nodeVar),
                );
                currentFrag = js`${currentFrag}.map(${mapper})`;
            }
        } else {
            currentFrag = getPropertyAccessFrag(segment.field.name, currentFrag);
        }

        if (segment.isListSegment) {
            isList = true;
        }
    }

    if (node.alwaysProduceList && !isList) {
        const resultVar = js.variable('result');
        currentFrag = jsExt.evaluatingLambda(
            resultVar,
            js`${currentFrag} == null ? [] : [ ${currentFrag} ]`,
            currentFrag,
        );
    }

    return currentFrag;
});

register(CreateEntityQueryNode, (node, context) => {
    const objVar = js.variable('obj');
    const idVar = js.variable('id');
    return jsExt.executingFunction(
        js`const ${objVar} = ${processNode(node.objectNode, context)};`,
        js`const ${idVar} = support.generateID();`,
        js`${objVar}.${js.identifier(ID_FIELD_NAME)} = ${idVar};`,
        js`${js.collection(getCollectionNameForRootEntity(node.rootEntityType))}.push(${objVar});`,
        js`return ${idVar};`,
    );
});

register(CreateEntitiesQueryNode, (node, context) => {
    const objectVar = new VariableQueryNode('object');
    const transformedNode = new TransformListQueryNode({
        listNode: node.objectsNode,
        itemVariable: objectVar,
        innerNode: new CreateEntityQueryNode(node.rootEntityType, objectVar, node.affectedFields),
    });
    return processNode(transformedNode, context);
});

register(UpdateEntitiesQueryNode, (node, context) => {
    const newContext = context.introduceVariable(node.currentEntityVariable);
    const entityVar = newContext.getVariable(node.currentEntityVariable);

    function lambda(inner: JSFragment) {
        return jsExt.lambda(entityVar, inner);
    }

    const updateFunction: JSFragment = jsExt.executingFunction(
        js`Object.assign(${entityVar}, ${processNode(
            new ObjectQueryNode(node.updates),
            newContext,
        )});`,
        js`return ${entityVar}.${js.identifier(ID_FIELD_NAME)};`,
    );

    return js.lines(
        js`${processNode(node.listNode, context)}`,
        js.indent(js.lines(js`.map(${lambda(updateFunction)})`)),
    );
});

register(DeleteEntitiesQueryNode, (node, context) => {
    const itemVar = js.variable(decapitalize(node.rootEntityType.name));
    const listVar = js.variable('objectsToDelete');
    const coll = js.collection(getCollectionNameForRootEntity(node.rootEntityType));
    const idsVar = js.variable('ids');
    const oldsVar = js.variable('olds');

    let idListFrag;
    let oldsFrag;
    switch (node.entitiesIdentifierKind) {
        case EntitiesIdentifierKind.ENTITY:
            idListFrag = js`${listVar}.map(${jsExt.lambda(
                itemVar,
                js`${itemVar}.${js.identifier(ID_FIELD_NAME)}`,
            )})`;
            oldsFrag = listVar;
            break;
        case EntitiesIdentifierKind.ID:
            idListFrag = listVar;
            const itemVar2 = js.variable(decapitalize(node.rootEntityType.name));
            // pretty inefficient, but it's only the js adapter, right
            oldsFrag = js`${idListFrag}.map(${jsExt.lambda(
                itemVar,
                js`${coll}.find(${jsExt.lambda(
                    itemVar2,
                    js`${itemVar2}.${js.identifier(ID_FIELD_NAME)} === ${itemVar}`,
                )})`,
            )})`;
            break;
        default:
            throw new Error(`Unexpected EntitiesIdentifierKind: ${node.entitiesIdentifierKind}`);
    }

    return jsExt.executingFunction(
        js`const ${listVar} = ${processNode(node.listNode, context)}`,
        js`const ${idsVar} = new Set(${idListFrag});`,
        js`const ${oldsVar} = ${oldsFrag};`,
        js`${coll} = ${coll}.filter(${jsExt.lambda(
            itemVar,
            js`!${idsVar}.has(${itemVar}.${js.identifier(ID_FIELD_NAME)})`,
        )});`,
        js`return ${oldsVar};`,
    );
});

register(AddEdgesQueryNode, (node, context) => {
    const coll = getCollectionForRelation(node.relation, context);

    const edgesJS = js.lines(
        js`[`,
        js.indent(
            js.join(
                node.edges.map(
                    (edge) =>
                        js`{ _from: ${processNode(edge.fromIDNode, context)}, _to: ${processNode(
                            edge.toIDNode,
                            context,
                        )} }`,
                ),
                js`,\n`,
            ),
        ),
        js`]`,
    );

    function edgeExists(edge: JSFragment) {
        const edgeVar = js.variable('edge');
        return js`${coll}.some(${jsExt.lambda(
            edgeVar,
            js`${edgeVar}._from == ${edge}._from && ${edgeVar}._to === ${edge}._to`,
        )})`;
    }

    const toAdd = js.variable(`toAdd`);
    return js`${edgesJS}.forEach(${jsExt.lambda(
        toAdd,
        js`${edgeExists(toAdd)} ? undefined : ${coll}.push(${toAdd})`,
    )})`;
});

register(RemoveEdgesQueryNode, (node, context) => {
    const coll = getCollectionForRelation(node.relation, context);
    const edgeVar = js.variable('edge');
    const fromIDs = node.edgeFilter.fromIDsNode
        ? processNode(node.edgeFilter.fromIDsNode, context)
        : undefined;
    const toIDs = node.edgeFilter.toIDsNode
        ? processNode(node.edgeFilter.toIDsNode, context)
        : undefined;
    const edgeRemovalCriteria = compact([
        fromIDs ? js`${fromIDs}.includes(${edgeVar}._from)` : undefined,
        toIDs ? js`${toIDs}.includes(${edgeVar}._to)` : undefined,
    ]);
    const edgeShouldStay = js`!(${js.join(edgeRemovalCriteria, js` && `)})`;

    return jsExt.executingFunction(
        js`${coll} = ${coll}.filter(${jsExt.lambda(edgeVar, edgeShouldStay)});`,
    );
});

register(OperatorWithAnalyzerQueryNode, (node, context) => {
    if (
        node.analyzer !== NORM_CI_ANALYZER &&
        node.analyzer !== IDENTITY_ANALYZER &&
        node.analyzer !== null
    ) {
        throw new FlexSearchAnalyzerNotSupportedError(node.analyzer);
    }

    const isCaseInsensitive = node.analyzer === NORM_CI_ANALYZER;

    let lhs = processNode(node.lhs, context);
    let rhs = processNode(node.rhs, context);

    // imitating flexSearch here. All fields can be arrays, flexsearch/arangosearch would flatten them
    // easiest way is to always convert lhs to an array
    const lhsArray = js`support.ensureArray(${lhs})`;
    const itemVar = js.variable('i');
    let itemFrag = itemVar;

    if (isCaseInsensitive) {
        itemFrag = js`(${itemFrag})?.toLowerCase()`;
        const rhsVar = js.variable('rhs');
        rhs = jsExt.evaluatingLambda(
            rhsVar,
            js`(Array.isArray(${rhsVar}) ? ${rhsVar}.map(value => value?.toLowerCase()) : (${rhsVar})?.toLowerCase())`,
            rhs,
        );
    }

    let opFrag: JSFragment;
    switch (node.operator) {
        case BinaryOperatorWithAnalyzer.EQUAL:
            opFrag = js`(${itemFrag} === ${rhs})`;
            break;
        case BinaryOperatorWithAnalyzer.UNEQUAL:
            opFrag = js`(${itemFrag} !== ${rhs})`;
            break;
        case BinaryOperatorWithAnalyzer.FLEX_STRING_LESS_THAN:
            opFrag = compare(js`<`, itemFrag, rhs);
            break;
        case BinaryOperatorWithAnalyzer.FLEX_STRING_LESS_THAN_OR_EQUAL:
            opFrag = compare(js`<=`, itemFrag, rhs);
            break;
        case BinaryOperatorWithAnalyzer.FLEX_STRING_GREATER_THAN:
            opFrag = compare(js`>`, itemFrag, rhs);
            break;
        case BinaryOperatorWithAnalyzer.FLEX_STRING_GREATER_THAN_OR_EQUAL:
            opFrag = compare(js`>=`, itemFrag, rhs);
            break;
        case BinaryOperatorWithAnalyzer.IN:
            opFrag = js`${rhs}.includes(${itemFrag})`;
            break;
        case BinaryOperatorWithAnalyzer.FLEX_SEARCH_CONTAINS_ANY_WORD:
        case BinaryOperatorWithAnalyzer.FLEX_SEARCH_CONTAINS_PREFIX:
        case BinaryOperatorWithAnalyzer.FLEX_SEARCH_CONTAINS_PHRASE:
        default:
            throw new Error(`Unsupported binary operator with analyzer: ${node.operator}`);
    }

    return js`${lhsArray}.some(${itemVar} => ${opFrag})`;
});

register(FlexSearchQueryNode, (node, context) => {
    let itemContext = context.introduceVariable(node.itemVariable);
    const itemVar = itemContext.getVariable(node.itemVariable);

    function lambda(exprNode: QueryNode) {
        return jsExt.lambda(itemVar, processNode(exprNode, itemContext));
    }

    const isFiltered =
        !(node.flexFilterNode instanceof ConstBoolQueryNode) || node.flexFilterNode.value != true;

    let orderFrag = js``;
    if (node.rootEntityType.flexSearchPrimarySort.length) {
        const order = new OrderSpecification(
            node.rootEntityType.flexSearchPrimarySort.map(
                (c) =>
                    new OrderClause(createFieldPathNode(c.field, node.itemVariable), c.direction),
            ),
        );
        const comparator = getComparatorForOrderSpecification(order, itemVar, itemContext);
        orderFrag = js`.slice().sort(${comparator})`;
    }

    return js.lines(
        getCollectionForType(node.rootEntityType, context),
        js.indent(js.lines(isFiltered ? js`.filter(${lambda(node.flexFilterNode)})` : js``)),
        orderFrag,
    );
});

register(FlexSearchFieldExistsQueryNode, (node, context) => {
    const valueFrag = processNode(node.sourceNode, context);
    const valueVar = js.variable('val');
    // EXISTS is false for empty arrays, and we make use of this
    return jsExt.evaluatingLambda(
        valueVar,
        js`${valueVar} != null && (!Array.isArray(${valueVar}) || ${valueVar}.length)`,
        valueFrag,
    );
});

register(FieldPathQueryNode, (node, context) => {
    const object = processNode(node.objectNode, context);
    for (const field of node.path) {
        if (field.isList) {
            throw new FlexSearchAggregationNotSupportedError();
        }
    }
    let fragment = getPropertyAccessFrag(node.path[0].name, object);
    for (const field of node.path.slice(1, node.path.length)) {
        fragment = getPropertyAccessFrag(field.name, fragment);
    }
    return fragment;
});

register(FlexSearchStartsWithQueryNode, (node, context) => {
    const lhs = processNode(node.lhs, context);
    const rhs = processNode(node.rhs, context);
    return js`(String(${lhs}).startsWith(${rhs}))`;
});

register(FlexSearchComplexOperatorQueryNode, (node, context) => {
    throw new Error(
        `Internal Error: FlexSearchComplexOperatorQueryNode must be expanded before generating the query.`,
    );
});

register(CreateBillingEntityQueryNode, (node, context) => {
    const currentTimestamp = context.options.clock.getCurrentTimestamp();
    const billingEntities = js.collection('billingEntities');

    return jsExt.executingFunction(
        js`
            const entry = ${billingEntities}.find(value => (value.key === ${
                node.key
            } && value.type === ${node.rootEntityTypeName}));
            if(!entry){
                ${billingEntities}.push({
                    key: ${node.key},
                    type: ${node.rootEntityTypeName},
                    category: ${processNode(node.categoryNode, context)},
                    quantity: ${processNode(node.quantityNode, context)},
                    isExported: false,
                    isConfirmedForExport: false,
                    createdAt: ${currentTimestamp},
                    updatedAt: ${currentTimestamp}
                });
           }`,
    );
});

register(ConfirmForBillingQueryNode, (node, context) => {
    const key = processNode(node.keyNode, context);
    const currentTimestamp = context.options.clock.getCurrentTimestamp();
    const billingEntities = js.collection('billingEntities');

    return jsExt.executingFunction(
        js`
            const entry = ${billingEntities}.find(value => (value.key === ${key} && value.type === ${
                node.rootEntityTypeName
            }));
            if(!entry){
                ${billingEntities}.push({
                    key: ${key},
                    type: ${node.rootEntityTypeName},
                    isExported: false,
                    category: ${processNode(node.categoryNode, context)},
                    quantity: ${processNode(node.quantityNode, context)},
                    isConfirmedForExport: true,
                    confirmedForExportAt: ${currentTimestamp},
                    createdAt: ${currentTimestamp},
                    updatedAt: ${currentTimestamp}
                });
           } else {
               entry.isConfirmedForExport = true;
               entry.confirmedForExportAt = ${currentTimestamp};
           }`,
    );
});

register(SetEdgeQueryNode, (node, context) => {
    const coll = getCollectionForRelation(node.relation, context);
    const edgeVar = js.variable('edge');
    const edgeRemovalCriteria = compact([
        node.existingEdge.fromIDNode
            ? js`${edgeVar}._from == ${processNode(node.existingEdge.fromIDNode, context)}`
            : undefined,
        node.existingEdge.toIDNode
            ? js`${edgeVar}._to == ${processNode(node.existingEdge.toIDNode, context)}`
            : undefined,
    ]);
    const edgeShouldStay = js`!(${js.join(edgeRemovalCriteria, js` && `)})`;

    return jsExt.executingFunction(
        js`${coll} = ${coll}.filter(${jsExt.lambda(edgeVar, edgeShouldStay)});`,
        js`${coll}.push({ _from: ${processNode(
            node.newEdge.fromIDNode,
            context,
        )}, _to: ${processNode(node.newEdge.toIDNode, context)} });`,
    );
});

function getJSOperator(op: BinaryOperator): JSFragment | undefined {
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

function getComparatorForOrderSpecification(
    orderBy: OrderSpecification,
    itemVar: JSFragment,
    context: QueryContext,
) {
    function getClauseFnAndInvert(clause: OrderClause): JSFragment {
        const valueLambda = jsExt.lambda(itemVar, processNode(clause.valueNode, context));
        return js`[${valueLambda}, ${
            clause.direction == OrderDirection.DESCENDING ? js`true` : js`false`
        }]`;
    }

    const args = orderBy.clauses.map((clause) => getClauseFnAndInvert(clause));

    return js`support.getMultiComparator(${js.join(args, js`, `)})`;
}

function processNode(node: QueryNode, context: QueryContext): JSFragment {
    const processor = processors.get(node.constructor as Constructor<QueryNode>);
    if (!processor) {
        throw new Error(`Unsupported query type: ${node.constructor}`);
    }
    return processor(node, context);
}

// TODO I think JSCompoundQuery (JS transaction node) should not be the exported type
// we should rather export ReadonlyArray<JSExecutableQuery> (as JS transaction) directly.
export function getJSQuery(
    node: QueryNode,
    options: Partial<QueryGenerationOptions> = {},
): JSCompoundQuery {
    return createJSCompoundQuery(
        node,
        js.queryResultVariable('result'),
        undefined,
        new QueryContext({
            clock: options.clock ?? new DefaultClock(),
            idGenerator: options.idGenerator ?? new UUIDGenerator(),
        }),
    );
}

function getCollectionForType(type: RootEntityType, context: QueryContext) {
    const name = getCollectionNameForRootEntity(type);
    return js.collection(name);
}

function getCollectionForRelation(relation: Relation, context: QueryContext) {
    const name = getCollectionNameForRelation(relation);
    return js.collection(name);
}

function compare(comp: JSFragment, lhs: JSFragment, rhs: JSFragment) {
    return js.lines(
        js`support.compare(`,
        js.indent(js.lines(js`${lhs},`, js`${rhs}`)),
        js`) ${comp} 0`,
    );
}

/**
 * Is thrown if a FlexSearch query containing fulltext-filters is performed for an in-memory database.
 */
export class FlexSearchAnalyzerNotSupportedError extends Error {
    constructor(analyzer: string) {
        super(
            `FlexSearch-query was not executed, because filters with analyzer "${analyzer}" are not supported for in-memory database.`,
        );
        this.name = this.constructor.name;
    }
}

/**
 * Is thrown if a FlexSearch query containing an aggregation filter is performed for an in-memory database.
 */
export class FlexSearchAggregationNotSupportedError extends Error {
    constructor() {
        super(
            `FlexSearch-query was not executed, because aggregations are not supported for in-memory database.`,
        );
        this.name = this.constructor.name;
    }
}
