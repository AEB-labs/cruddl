import { compact, indent } from '../utils/utils';
import { QueryNode } from './base';
import { QueryResultValidator } from './validation';
import { VariableQueryNode } from './variables';

export class PreExecQueryParms extends QueryNode {
    constructor(params: {
        query: QueryNode;
        resultVariable?: VariableQueryNode;
        resultValidator?: QueryResultValidator;
    }) {
        super();
        this.query = params.query;
        this.resultVariable = params.resultVariable;
        this.resultValidator = params.resultValidator;
    }

    public readonly query: QueryNode;
    public readonly resultVariable: VariableQueryNode | undefined;
    public readonly resultValidator: QueryResultValidator | undefined;

    describe() {
        const resultVarDescr = this.resultVariable ? `${this.resultVariable.describe()} = ` : '';
        const validatorDescr = this.resultValidator
            ? ' validate result: ' + this.resultValidator.describe()
            : '';
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
    public readonly preExecQueries: ReadonlyArray<PreExecQueryParms>;
    public readonly resultNode: QueryNode;

    constructor(params: {
        resultNode: QueryNode;
        preExecQueries: ReadonlyArray<PreExecQueryParms | undefined>;
    }) {
        super();
        this.preExecQueries = compact(params.preExecQueries);
        this.resultNode = params.resultNode;
    }

    public describe() {
        if (!this.preExecQueries.length) {
            return this.resultNode.describe();
        }

        const preExecDescriptions = this.preExecQueries.map((q) => q.describe());
        const resultDescr = '(\n' + indent(this.resultNode.describe()) + '\n)';

        return (
            'pre execute\n' +
            indent(
                '' + // '' to move the arg label here in WebStorm
                    preExecDescriptions.join('\nthen ') +
                    '\n' +
                    `return ${resultDescr}`,
            )
        );
    }
}
