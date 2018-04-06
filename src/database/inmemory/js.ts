import { arrayToObject, flatMap } from '../../utils/utils';
import { QueryResultValidator } from '../../query/query-result-validators';
import { cyan, magenta } from 'colors/safe';

require('colors');

function stringify(val: any) {
    if (val === undefined) {
        return "undefined";
    }
    return JSON.stringify(val);
}

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

export class JSCodeBuildingContext {
    private boundValues: any[] = [];
    private variableBindings = new Map<JSVariable, string>();
    private preExecInjectedVariablesMap = new Map<JSQueryResultVariable, string>();
    private nextIndexPerLabel = new Map<string, number>();
    public indentationLevel = 0;

    private static getBoundValueName(index: number) {
        return 'var' + (index + 1);
    }

    private static DEFAULT_LABEL = 'tmp';

    private static getSafeLabel(label: string|undefined): string {
        if (label) {
            // avoid collisions with collection names, functions and keywords
            label = 'v_' + label;
        }
        if (!label || !js.isSafeIdentifier(label)) {
            // bail out
            label = JSCodeBuildingContext.DEFAULT_LABEL;
        }
        return label;
    }

    private static getVarName(label: string, index: number) {
        return label + (index + 1);
    }

    bindValue(value: any): string {
        const index = this.boundValues.length;
        if (value === undefined) {
            // JS does not know about "undefined" and would complain about a missing value for bind parameter.
            value = null;
        }
        this.boundValues.push(value);
        return JSCodeBuildingContext.getBoundValueName(index);
    }

    getOrAddVariable(token: JSVariable): string {
        const existingBinding = this.variableBindings.get(token);
        if (existingBinding != undefined) {
            return existingBinding;
        }
        const safeLabel = JSCodeBuildingContext.getSafeLabel(token.label);
        const newIndex = this.nextIndexPerLabel.get(safeLabel) || 0;
        this.nextIndexPerLabel.set(safeLabel, newIndex + 1);
        const newBinding = JSCodeBuildingContext.getVarName(safeLabel, newIndex);
        this.variableBindings.set(token, newBinding);
        if (token instanceof JSQueryResultVariable) {
            this.preExecInjectedVariablesMap.set(token, newBinding);
        }
        return newBinding;
    }

    getBoundValueMap() {
        return arrayToObject(this.boundValues, (_, index) => JSCodeBuildingContext.getBoundValueName(index));
    }

    getPreExecInjectedVariablesMap(): Map<JSQueryResultVariable, string> {
        return this.preExecInjectedVariablesMap;
    }
}

export abstract class JSFragment {
    toString(): string {
        return this.toStringWithContext(new JSCodeBuildingContext());
    }

    toColoredString(): string {
        return this.toColoredStringWithContext(new JSCodeBuildingContext());
    }

    getCode() {
        const context = new JSCodeBuildingContext();
        const code = this.getCodeWithContext(context);
        return {
            code,
            boundValues: context.getBoundValueMap(),
            usedResultVariables: context.getPreExecInjectedVariablesMap()
        };
    }

    isEmpty() {
        return false;
    }

    abstract toStringWithContext(context: JSCodeBuildingContext): string
    abstract toColoredStringWithContext(context: JSCodeBuildingContext): string
    abstract getCodeWithContext(context: JSCodeBuildingContext): string;
}

export class JSCodeFragment extends JSFragment {
    constructor(public readonly JS: string) {
        super();
    }

    isEmpty() {
        return !this.JS.length;
    }

    toStringWithContext(context: JSCodeBuildingContext): string {
        return indentLineBreaks(this.JS, context.indentationLevel);
    }

    toColoredStringWithContext(context: JSCodeBuildingContext): string {
        return this.toStringWithContext(context);
    }

    getCodeWithContext(context: JSCodeBuildingContext): string {
        return indentLineBreaks(this.JS, context.indentationLevel);
    }
}

export class JSVariable extends JSFragment {
    constructor(public readonly label?: string) {
        super();
    }

    getCodeWithContext(context: JSCodeBuildingContext): string {
        return context.getOrAddVariable(this);
    }

    toStringWithContext(context: JSCodeBuildingContext): string {
        return this.getCodeWithContext(context);
    }

    toColoredStringWithContext(context: JSCodeBuildingContext): string {
        return magenta(this.toStringWithContext(context));
    }
}

export class JSQueryResultVariable extends JSVariable {

    getCodeWithContext(context: JSCodeBuildingContext): string {
        return 'boundValues[' + JSON.stringify(context.getOrAddVariable(this)) + ']';
    }
}

export class JSBoundValue extends JSFragment {
    constructor(public readonly value: any) {
        super();
    }

    toStringWithContext(context: JSCodeBuildingContext): string {
        return indentLineBreaks(stringify(this.value), context.indentationLevel);
    }

    toColoredStringWithContext(): string {
        return cyan(this.toString());
    }

    getCodeWithContext(context: JSCodeBuildingContext): string {
        return 'boundValues[' + JSON.stringify(context.bindValue(this.value)) + ']';
    }
}

export class JSCompoundFragment extends JSFragment {
    constructor(public readonly fragments: JSFragment[]) {
        super();
    }

    isEmpty() {
        return this.fragments.length == 0 || this.fragments.every(fr => fr.isEmpty());
    }

    toStringWithContext(context: JSCodeBuildingContext): string {
        return this.fragments.map(fr => fr.toStringWithContext(context)).join('');
    }

    toColoredStringWithContext(context: JSCodeBuildingContext): string {
        return this.fragments.map(fr => fr.toColoredStringWithContext(context)).join('');
    }

    getCodeWithContext(context: JSCodeBuildingContext): string {
        // loop and += seems to be faster than join()
        let code = '';
        for (const fragment of this.fragments) {
            code += fragment.getCodeWithContext(context);
        }
        return code;
    }
}

export class JSIndentationFragment extends JSFragment {
    constructor(public readonly fragment: JSFragment) {
        super();
    }

    isEmpty() {
        return this.fragment.isEmpty();
    }

    toStringWithContext(context: JSCodeBuildingContext): string {
        context.indentationLevel++;
        const result = INDENTATION + this.fragment.toStringWithContext(context);
        context.indentationLevel--;
        return result;
    }

    toColoredStringWithContext(context: JSCodeBuildingContext): string {
        context.indentationLevel++;
        const result = INDENTATION + this.fragment.toColoredStringWithContext(context);
        context.indentationLevel--;
        return result;
    }

    getCodeWithContext(context: JSCodeBuildingContext): string {
        context.indentationLevel++;
        const code = INDENTATION + this.fragment.getCodeWithContext(context);
        context.indentationLevel--;
        return code;
    }
}

export function js(strings: ReadonlyArray<string>, ...values: any[]): JSFragment {
    let snippets = [...strings];
    let fragments: JSFragment[] = [];
    while (snippets.length || values.length) {
        if (snippets.length) {
            fragments.push(new JSCodeFragment(snippets.shift()!));
        }
        if (values.length) {
            const value = values.shift();
            if (value instanceof JSCompoundFragment) {
                fragments.push(...value.fragments);
            } else if (value instanceof JSFragment) {
                fragments.push(value);
            } else {
                fragments.push(new JSBoundValue(value));
            }
        }
    }

    return new JSCompoundFragment(fragments);
}

export namespace js {
    export function join(fragments: JSFragment[], separator: JSFragment): JSFragment {
        const newFragments: JSFragment[] = [];
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
        return new JSCompoundFragment(newFragments);
    }

    export function code(code: string): JSFragment {
        return new JSCodeFragment(code);
    }

    export function lines(...fragments: JSFragment[]) {
        return join(fragments, js`\n`);
    }

    export function indent(fragment: JSFragment) {
        return new JSIndentationFragment(fragment);
    }

    export function variable(label?: string): JSFragment {
        return new JSVariable(label);
    }

    export function queryResultVariable(label?: string): JSQueryResultVariable {
        return new JSQueryResultVariable(label);
    }

    export function collection(name: string): JSFragment {
        return js`db.collections[${js.string(name)}]`;
    }

    export function identifier(name: string): JSFragment {
        if (!isSafeIdentifier(name)) {
            throw new Error(`Possibly invalid/unsafe identifier in JS: ${name}`);
        }
        return code(name);
    }

    /**
     * Should be used when fairly certain that string can't be malicious
     *
     * As the string is json-encoded, it *should* be fine in any case, but still, user-supplied strings in queries is scary
     */
    export function string(str: string): JSFragment {
        return code(JSON.stringify(str));
    }

    export function integer(number: number): JSFragment {
        return code(JSON.stringify(Number(number)))
    }

    export function isSafeIdentifier(str: string) {
        // being pessimistic for security reasons
        // TODO collisions with collection names / keywords?
        return typeof str == 'string' && str.match(/^[a-zA-Z0-9_]+$/);
    }
}

//TODO Refactor. JSCompoundQuery isn't a real JSFragment.
/**
 * A node in an JS transaction tree
 *
 * This is an intermediate representation in the process of converting a query tree to an JS transaction. The
 * transaction tree's root is the root query. Children of a transaction node are the direct preExec queries of a query.
 * Thus, the query tree is reduced to WithPreExecQueryNodes as nodes, all other kinds of nodes are already processed
 * into JSFragments.
 */
export class JSCompoundQuery extends JSFragment {

    constructor(
        public readonly preExecQueries: JSCompoundQuery[],
        public readonly jsQuery: JSFragment,
        public readonly resultVar: JSQueryResultVariable|undefined,
        public readonly resultValidator: QueryResultValidator|undefined) {
        super();
    }

    /**
     * Gets the linear JS transaction for this transaction tree
     *
     * The returned transaction steps are to be executed sequentially.
     */
    getExecutableQueries(): JSExecutableQuery[] {
        const resultVarToNameMap = new Map<JSQueryResultVariable, string>();
        return this.getExecutableQueriesRecursive(resultVarToNameMap);
    }

    private getExecutableQueriesRecursive(resultVarToNameMap: Map<JSQueryResultVariable, string>): JSExecutableQuery[] {
        const executableQueries = flatMap(this.preExecQueries, JSQuery =>
            JSQuery.getExecutableQueriesRecursive(resultVarToNameMap));

        const { code, boundValues, usedResultVariables } = this.jsQuery.getCode();

        const usedResultNames: {[p: string]: string} = {};
        usedResultVariables.forEach((bindParamName, JSVariable) => {
            const usedResultName = resultVarToNameMap.get(JSVariable);
            if (!usedResultName) {
                throw new Error(`Name for query result variable ${JSVariable} not found.`);
            }
            usedResultNames[usedResultName] = bindParamName;
        });

        let queryResultName = undefined;
        if (this.resultVar) {
            queryResultName = "query_result_" + resultVarToNameMap.size;
            resultVarToNameMap.set(this.resultVar, queryResultName);
        }

        let queryResultValidator = undefined;
        if (this.resultValidator) {
            queryResultValidator = {[this.resultValidator.getValidatorName()]: this.resultValidator.getValidatorData()};
        }

        const executableQuery = new JSExecutableQuery(code, boundValues, usedResultNames, queryResultName, queryResultValidator);
        executableQueries.push(executableQuery);

        return executableQueries;
    }

    //TODO Refactor the following three methods. JSCompoundQuery isn't a real JSFragment.
    //TODO Include read/write accessed collections in output
    toStringWithContext(context: JSCodeBuildingContext): string {
        let descriptions = this.preExecQueries.map(JSQuery => JSQuery.toStringWithContext(context));
        const varDescription = this.resultVar ? this.resultVar.toStringWithContext(context) + ' = ' : '';
        const validatorDescription = this.resultValidator ? ' validate result ' + this.resultValidator.describe(): '';
        const execDescription = varDescription + 'execute(\n' +
            js.indent(this.jsQuery).toStringWithContext(context) + '\n)' + validatorDescription + ';';
        descriptions.push(execDescription);
        return descriptions.join('\n')
    }

    toColoredStringWithContext(context: JSCodeBuildingContext): string {
        let descriptions = this.preExecQueries.map(JSQuery => JSQuery.toColoredStringWithContext(context));
        const varDescription = this.resultVar ? this.resultVar.toColoredStringWithContext(context) + ' = ' : '';
        const validatorDescription = this.resultValidator ? ' validate result ' + this.resultValidator.describe(): '';
        const execDescription = varDescription + 'execute(\n' +
            js.indent(this.jsQuery).toColoredStringWithContext(context) + '\n)' + validatorDescription + ';';
        descriptions.push(execDescription);
        return descriptions.join('\n')
    }

    getCodeWithContext(context: JSCodeBuildingContext): string {
        throw new Error('Unsupported Operation. JSCompoundQuery can not provide a single JS statement.')
    }
}

/**
 * A step in an JS transaction
 */
export class JSExecutableQuery {
    constructor(
        public readonly code: string,
        public readonly boundValues: {[p: string]: any},
        public readonly usedPreExecResultNames: {[p: string]: string},
        public readonly resultName?: string,
        public readonly resultValidator?: {[name:string]:any}) {
    }
}
