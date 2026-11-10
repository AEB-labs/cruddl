import type { QueryResultValidator } from '../core/query-tree/validation.js';
import { blue, cyan, magenta } from '../core/utils/colors.js';
import { isDefined } from '../core/utils/utils.js';

function stringify(val: any) {
    if (val === undefined) {
        return 'undefined';
    }
    return JSON.stringify(val);
}

export const aqlConfig = { enableIndentationForCode: false };

const INDENTATION = '  ';
/**
 * Like indent(), but does not indent the first line
 */
function indentLineBreaks(val: string, level: number) {
    if (level == 0) {
        return val;
    }
    const indent = INDENTATION.repeat(level);
    return val.replace(/\n/g, '\n' + indent);
}

export interface AQLCodeOptions {
    /**
     * Whether to collect the query tree variable indices of the variables (see
     * associateWithQueryTreeVariable())
     */
    readonly collectQueryTreeVariableIndices?: boolean;
}

export class AQLCodeBuildingContext {
    private readonly boundValues: unknown[] = [];
    private readonly boundCollectionNames = new Set<string>();
    private variableBindings = new Map<AQLVariable, string>();
    private preExecInjectedVariablesMap = new Map<AQLQueryResultVariable, string>();
    private nextIndexPerLabel = new Map<string, number>();
    private readonly queryTreeVariableIndices: { [variableName: string]: number } | undefined;
    public indentationLevel = 0;

    constructor(options: AQLCodeOptions = {}) {
        this.queryTreeVariableIndices = options.collectQueryTreeVariableIndices ? {} : undefined;
    }

    private static getBoundValueName(index: number) {
        return 'var' + (index + 1);
    }

    private static DEFAULT_LABEL = 'tmp';

    private static getSafeLabel(label: string | undefined): string {
        if (label) {
            // avoid collisions with collection names, functions and keywords
            // (v_ will never collide with a collection name because collection names are pluralized and v is not a plural)
            label = 'v_' + label;
        }
        if (!label || !aql.isSafeIdentifier(label)) {
            // bail out
            label = AQLCodeBuildingContext.DEFAULT_LABEL;
        }
        // we prefixed with v_, so we can't collide with a keyword -> no need for ``
        return label;
    }

    private static getVarName(label: string, index: number) {
        return label + (index + 1);
    }

    bindValue(value: any): string {
        const index = this.boundValues.length;
        if (value === undefined) {
            // AQL does not know about "undefined" and would complain about a missing value for bind parameter.
            value = null;
        }
        this.boundValues.push(value);
        return AQLCodeBuildingContext.getBoundValueName(index);
    }

    bindCollectionName(collectionName: string): string {
        this.boundCollectionNames.add(collectionName);
        return '@@' + collectionName;
    }

    getOrAddVariable(token: AQLVariable): string {
        const existingBinding = this.variableBindings.get(token);
        if (isDefined(existingBinding)) {
            return existingBinding;
        }
        const safeLabel = AQLCodeBuildingContext.getSafeLabel(token.label);
        const newIndex = this.nextIndexPerLabel.get(safeLabel) || 0;
        this.nextIndexPerLabel.set(safeLabel, newIndex + 1);
        const newBinding = AQLCodeBuildingContext.getVarName(safeLabel, newIndex);
        this.variableBindings.set(token, newBinding);
        if (token instanceof AQLQueryResultVariable) {
            this.preExecInjectedVariablesMap.set(token, newBinding);
        } else if (this.queryTreeVariableIndices) {
            const queryTreeVariableIndex = queryTreeVariableIndices.get(token);
            if (isDefined(queryTreeVariableIndex)) {
                this.queryTreeVariableIndices[newBinding] = queryTreeVariableIndex;
            }
        }
        return newBinding;
    }

    getBoundValueMap() {
        let result: { [key: string]: unknown } = {};
        for (let i = 0; i < this.boundValues.length; i++) {
            const name = AQLCodeBuildingContext.getBoundValueName(i);
            result[name] = this.boundValues[i];
        }
        for (const collectionName of this.boundCollectionNames) {
            result['@' + collectionName] = collectionName;
        }
        return result;
    }

    getPreExecInjectedVariablesMap(): Map<AQLQueryResultVariable, string> {
        return this.preExecInjectedVariablesMap;
    }

    /**
     * The query tree variable indices by AQL variable name (only if collectQueryTreeVariableIndices is set)
     */
    getQueryTreeVariableIndices(): { readonly [variableName: string]: number } | undefined {
        return this.queryTreeVariableIndices;
    }
}

export abstract class AQLFragment {
    toString(): string {
        return this.toStringWithContext(new AQLCodeBuildingContext());
    }

    toColoredString(): string {
        return this.toColoredStringWithContext(new AQLCodeBuildingContext());
    }

    getCode(options?: AQLCodeOptions) {
        const context = new AQLCodeBuildingContext(options);
        const code = this.getCodeWithContext(context);
        return {
            code,
            boundValues: context.getBoundValueMap(),
            usedResultVariables: context.getPreExecInjectedVariablesMap(),
            queryTreeVariableIndices: context.getQueryTreeVariableIndices(),
        };
    }

    isEmpty() {
        return false;
    }

    /**
     * Whether this fragment contains a subquery (a fragment created with aql.subquery() or marked
     * with aql.markAsSubquery())
     *
     * Subqueries must not be used within array inline expressions ([* FILTER ...], [* RETURN ...]):
     * ArangoDB evaluates them before the enclosing statement, where CURRENT is not defined. This
     * results in internal errors ("variable not found") or, if the optimizer moves the filter into a
     * collection scan, in wrong results.
     */
    containsSubquery(): boolean {
        return false;
    }

    abstract toStringWithContext(context: AQLCodeBuildingContext): string;
    abstract toColoredStringWithContext(context: AQLCodeBuildingContext): string;
    abstract getCodeWithContext(context: AQLCodeBuildingContext): string;
}

export class AQLCodeFragment extends AQLFragment {
    constructor(public readonly aql: string) {
        super();
    }

    isEmpty() {
        return !this.aql.length;
    }

    toStringWithContext(context: AQLCodeBuildingContext): string {
        return indentLineBreaks(this.aql, context.indentationLevel);
    }

    toColoredStringWithContext(context: AQLCodeBuildingContext): string {
        return indentLineBreaks(this.aql, context.indentationLevel);
    }

    getCodeWithContext(context: AQLCodeBuildingContext): string {
        if (aqlConfig.enableIndentationForCode) {
            return indentLineBreaks(this.aql, context.indentationLevel);
        } else {
            return this.aql;
        }
    }
}

/**
 * The index of the query tree variable (VariableQueryNode.index) an AQLVariable represents
 *
 * Kept outside of AQLVariable because AQLVariable is used interchangeably with AQLFragment in many
 * places. Only informational, does not influence the generated code.
 */
const queryTreeVariableIndices = new WeakMap<AQLVariable, number>();

/**
 * Records that an AQLVariable represents a query tree variable (unless it already represents one)
 */
export function associateWithQueryTreeVariable(
    variable: AQLVariable,
    queryTreeVariableIndex: number,
) {
    if (!queryTreeVariableIndices.has(variable)) {
        queryTreeVariableIndices.set(variable, queryTreeVariableIndex);
    }
}

export class AQLVariable extends AQLFragment {
    constructor(public readonly label?: string) {
        super();
    }

    getCodeWithContext(context: AQLCodeBuildingContext): string {
        return context.getOrAddVariable(this);
    }

    toStringWithContext(context: AQLCodeBuildingContext): string {
        return this.getCodeWithContext(context);
    }

    toColoredStringWithContext(context: AQLCodeBuildingContext): string {
        return magenta(this.toStringWithContext(context));
    }
}

export class AQLQueryResultVariable extends AQLVariable {
    getCodeWithContext(context: AQLCodeBuildingContext): string {
        return '@' + super.getCodeWithContext(context);
    }
}

export class AQLBoundValue extends AQLFragment {
    constructor(public readonly value: any) {
        super();
    }

    toStringWithContext(context: AQLCodeBuildingContext): string {
        return indentLineBreaks(stringify(this.value), context.indentationLevel);
    }

    toColoredStringWithContext(): string {
        return cyan(this.toString());
    }

    getCodeWithContext(context: AQLCodeBuildingContext): string {
        return '@' + context.bindValue(this.value);
    }
}

export class AQLCollection extends AQLFragment {
    constructor(public readonly collectionName: string) {
        super();
        if (typeof collectionName !== 'string') {
            throw new Error(
                `Tried to create AQLCollection with a parameter that is not a string but ${typeof collectionName}`,
            );
        }
        // test this here so we are sure we can use it safely as bind parameter name
        if (!collectionName.match(/^[a-zA-Z0-9_]+$/)) {
            throw new Error(
                `Collection name does not follow conventions: ${JSON.stringify(collectionName)}`,
            );
        }
        // no need for these, so be safe
        if (collectionName.startsWith('_')) {
            throw new Error(
                `Tried to create AQLCollection with system collection (starts with _): ${collectionName}`,
            );
        }
        if (collectionName.startsWith('v_')) {
            // catch this early - shouldn't happen (v is not a plural), and could cause collisions with variables
            throw new Error(`Collections can't start with v_`);
        }
    }

    toStringWithContext(context: AQLCodeBuildingContext): string {
        return this.collectionName;
    }

    toColoredStringWithContext(): string {
        return blue(this.collectionName);
    }

    getCodeWithContext(context: AQLCodeBuildingContext): string {
        return context.bindCollectionName(this.collectionName);
    }
}

export class AQLCompoundFragment extends AQLFragment {
    private _containsSubquery: boolean | undefined;

    constructor(public readonly fragments: ReadonlyArray<AQLFragment>) {
        super();
    }

    isEmpty() {
        return this.fragments.length == 0 || this.fragments.every((fr) => fr.isEmpty());
    }

    containsSubquery(): boolean {
        if (this._containsSubquery === undefined) {
            this._containsSubquery = this.fragments.some((fr) => fr.containsSubquery());
        }
        return this._containsSubquery;
    }

    toStringWithContext(context: AQLCodeBuildingContext): string {
        return this.fragments.map((fr) => fr.toStringWithContext(context)).join('');
    }

    toColoredStringWithContext(context: AQLCodeBuildingContext): string {
        return this.fragments.map((fr) => fr.toColoredStringWithContext(context)).join('');
    }

    getCodeWithContext(context: AQLCodeBuildingContext): string {
        // loop and += seems to be faster than join()
        let code = '';
        for (const fragment of this.fragments) {
            code += fragment.getCodeWithContext(context);
        }
        return code;
    }
}

export class AQLIndentationFragment extends AQLFragment {
    constructor(public readonly fragment: AQLFragment) {
        super();
    }

    isEmpty() {
        return this.fragment.isEmpty();
    }

    containsSubquery(): boolean {
        return this.fragment.containsSubquery();
    }

    toStringWithContext(context: AQLCodeBuildingContext): string {
        context.indentationLevel++;
        const result = INDENTATION + this.fragment.toStringWithContext(context);
        context.indentationLevel--;
        return result;
    }

    toColoredStringWithContext(context: AQLCodeBuildingContext): string {
        context.indentationLevel++;
        const result = INDENTATION + this.fragment.toColoredStringWithContext(context);
        context.indentationLevel--;
        return result;
    }

    getCodeWithContext(context: AQLCodeBuildingContext): string {
        if (!aqlConfig.enableIndentationForCode) {
            return this.fragment.getCodeWithContext(context);
        }

        context.indentationLevel++;
        const code = INDENTATION + this.fragment.getCodeWithContext(context);
        context.indentationLevel--;
        return code;
    }
}

/**
 * Wraps a fragment that is a subquery (including its parentheses) without changing how it is
 * rendered, so containsSubquery() can detect it
 */
export class AQLSubqueryFragment extends AQLFragment {
    constructor(public readonly fragment: AQLFragment) {
        super();
    }

    isEmpty() {
        return this.fragment.isEmpty();
    }

    containsSubquery(): boolean {
        return true;
    }

    toStringWithContext(context: AQLCodeBuildingContext): string {
        return this.fragment.toStringWithContext(context);
    }

    toColoredStringWithContext(context: AQLCodeBuildingContext): string {
        return this.fragment.toColoredStringWithContext(context);
    }

    getCodeWithContext(context: AQLCodeBuildingContext): string {
        return this.fragment.getCodeWithContext(context);
    }
}

export function aql(
    strings: ReadonlyArray<string>,
    ...values: (AQLFragment | string | number | boolean)[]
): AQLFragment {
    let snippets = [...strings];
    let fragments: AQLFragment[] = [];
    while (snippets.length || values.length) {
        if (snippets.length) {
            fragments.push(new AQLCodeFragment(snippets.shift()!));
        }
        if (values.length) {
            const value = values.shift();
            if (value instanceof AQLCompoundFragment) {
                fragments.push(...value.fragments);
            } else if (value instanceof AQLFragment) {
                fragments.push(value);
            } else if (
                typeof value === 'string' ||
                typeof value === 'number' ||
                typeof value === 'boolean'
            ) {
                fragments.push(new AQLBoundValue(value));
            } else {
                throw new Error(
                    `aql: Received a value that is neither an AQLFragment, nor a primitive`,
                );
            }
        }
    }

    return new AQLCompoundFragment(fragments);
}

export namespace aql {
    export function concat(fragments: ReadonlyArray<AQLFragment>) {
        return new AQLCompoundFragment(fragments);
    }

    export function join(
        fragments: ReadonlyArray<AQLFragment>,
        separator: AQLFragment,
    ): AQLFragment {
        const newFragments: AQLFragment[] = [];
        let isFirst = true;
        for (const fragment of fragments) {
            if (fragment.isEmpty()) {
                continue;
            }
            if (!isFirst) {
                newFragments.push(separator);
            }
            isFirst = false;
            newFragments.push(fragment);
        }
        return new AQLCompoundFragment(newFragments);
    }

    export function code(code: string): AQLFragment {
        return new AQLCodeFragment(code);
    }

    export function lines(...fragments: ReadonlyArray<AQLFragment>) {
        return join(fragments, aql`\n`);
    }

    export function indent(fragment: AQLFragment) {
        return new AQLIndentationFragment(fragment);
    }

    /**
     * Creates a subquery: the given lines, indented and wrapped in parentheses
     */
    export function subquery(...lines: ReadonlyArray<AQLFragment>): AQLFragment {
        return markAsSubquery(aql.lines(aql`(`, aql.indent(aql.lines(...lines)), aql`)`));
    }

    /**
     * Marks a fragment as a subquery (it should include the parentheses) without changing it
     *
     * Use aql.subquery() instead if possible. This is for subqueries that are written inline.
     */
    export function markAsSubquery(fragment: AQLFragment): AQLFragment {
        return new AQLSubqueryFragment(fragment);
    }

    export function variable(label?: string): AQLFragment {
        return new AQLVariable(label);
    }

    export function value(value: any): AQLFragment {
        return new AQLBoundValue(value);
    }

    export function queryResultVariable(label?: string): AQLQueryResultVariable {
        return new AQLQueryResultVariable(label);
    }

    export function collection(name: string): AQLFragment {
        return new AQLCollection(name);
    }

    export function identifier(name: string): AQLFragment {
        if (!isSafeIdentifier(name)) {
            throw new Error(`Possibly invalid/unsafe identifier in AQL: ${name}`);
        }
        // could always collide with a (future) keyword, so wrap in ``
        return code('`' + name + '`');
    }

    /**
     * Should be used when fairly certain that string can't be malicious
     *
     * As the string is json-encoded, it *should* be fine in any case, but still, user-supplied strings in queries is scary
     */
    export function string(str: string): AQLFragment {
        return code(JSON.stringify(str));
    }

    export function integer(number: number): AQLFragment {
        return code(JSON.stringify(Number(number)));
    }

    /**
     * Caution: should only use in .identifier() and NOT .code() because it does not account for keywords
     */
    export function isSafeIdentifier(str: string) {
        return typeof str == 'string' && str.match(/^[a-zA-Z][a-zA-Z0-9_]*$/);
    }
}

//TODO Refactor. AQLCompoundQuery isn't a real AQLFragment.
/**
 * A node in an AQL transaction tree
 *
 * This is an intermediate representation in the process of converting a query tree to an AQL transaction. The
 * transaction tree's root is the root query. Children of a transaction node are the direct preExec queries of a query.
 * Thus, the query tree is reduced to WithPreExecQueryNodes as nodes, all other kinds of nodes are already processed
 * into AQLFragments.
 */
export class AQLCompoundQuery extends AQLFragment {
    constructor(
        public readonly preExecQueries: ReadonlyArray<AQLCompoundQuery>,
        public readonly aqlQuery: AQLFragment,
        public readonly resultVar: AQLQueryResultVariable | undefined,
        public readonly resultValidator: QueryResultValidator | undefined,
        public readonly readAccessedCollections: ReadonlyArray<string>,
        public readonly writeAccessedCollections: ReadonlyArray<string>,
    ) {
        super();
    }

    /**
     * Gets the linear AQL transaction for this transaction tree
     *
     * The returned transaction steps are to be executed sequentially.
     */
    getExecutableQueries(options?: AQLCodeOptions): ReadonlyArray<AQLExecutableQuery> {
        const resultVarToNameMap = new Map<AQLQueryResultVariable, string>();
        return this.getExecutableQueriesRecursive(resultVarToNameMap, options);
    }

    private getExecutableQueriesRecursive(
        resultVarToNameMap: Map<AQLQueryResultVariable, string>,
        options: AQLCodeOptions | undefined,
    ): ReadonlyArray<AQLExecutableQuery> {
        const executableQueries = this.preExecQueries.flatMap((aqlQuery) =>
            aqlQuery.getExecutableQueriesRecursive(resultVarToNameMap, options),
        );

        const { code, boundValues, usedResultVariables, queryTreeVariableIndices } =
            this.aqlQuery.getCode(options);

        const usedResultNames: { [p: string]: string } = {};
        usedResultVariables.forEach((bindParamName, aqlVariable) => {
            const usedResultName = resultVarToNameMap.get(aqlVariable);
            if (!usedResultName) {
                throw new Error(`Name for query result variable ${aqlVariable} not found.`);
            }
            usedResultNames[usedResultName] = bindParamName;
        });

        let queryResultName = undefined;
        if (this.resultVar) {
            queryResultName = 'query_result_' + resultVarToNameMap.size;
            resultVarToNameMap.set(this.resultVar, queryResultName);
        }

        let queryResultValidator = undefined;
        if (this.resultValidator) {
            queryResultValidator = {
                [this.resultValidator.getValidatorName()]: this.resultValidator.getValidatorData(),
            };
        }

        const executableQuery = new AQLExecutableQuery(
            code,
            boundValues,
            usedResultNames,
            queryResultName,
            queryResultValidator,
            queryTreeVariableIndices,
        );
        return [...executableQueries, executableQuery];
    }

    //TODO Refactor the following three methods. AQLCompoundQuery isn't a real AQLFragment.
    //TODO Include read/write accessed collections in output
    toStringWithContext(context: AQLCodeBuildingContext): string {
        let descriptions = this.preExecQueries.map((aqlQuery) =>
            aqlQuery.toStringWithContext(context),
        );
        const varDescription = this.resultVar
            ? this.resultVar.toStringWithContext(context) + ' = '
            : '';
        const validatorDescription = this.resultValidator
            ? ' validate result ' + this.resultValidator.describe()
            : '';
        const execDescription =
            varDescription +
            'execute(\n' +
            aql.indent(this.aqlQuery).toStringWithContext(context) +
            '\n)' +
            validatorDescription +
            ';';
        descriptions.push(execDescription);
        return descriptions.join('\n');
    }

    toColoredStringWithContext(context: AQLCodeBuildingContext): string {
        let descriptions = this.preExecQueries.map((aqlQuery) =>
            aqlQuery.toColoredStringWithContext(context),
        );
        const varDescription = this.resultVar
            ? this.resultVar.toColoredStringWithContext(context) + ' = '
            : '';
        const validatorDescription = this.resultValidator
            ? ' validate result ' + this.resultValidator.describe()
            : '';
        const execDescription =
            varDescription +
            'execute(\n' +
            aql.indent(this.aqlQuery).toColoredStringWithContext(context) +
            '\n)' +
            validatorDescription +
            ';';
        descriptions.push(execDescription);
        return descriptions.join('\n');
    }

    getCodeWithContext(context: AQLCodeBuildingContext): string {
        throw new Error(
            'Unsupported Operation. AQLCompoundQuery can not provide a single AQL statement.',
        );
    }
}

/**
 * A step in an AQL transaction
 */
export class AQLExecutableQuery {
    constructor(
        public readonly code: string,
        public readonly boundValues: { [p: string]: any },
        public readonly usedPreExecResultNames: { [p: string]: string },
        public readonly resultName?: string,
        public readonly resultValidator?: { [name: string]: any },
        /**
         * The query tree variable indices (VariableQueryNode.index) by AQL variable name
         *
         * Only set if collectQueryTreeVariableIndices was specified.
         */
        public readonly queryTreeVariableIndices?: { readonly [variableName: string]: number },
    ) {}
}
