import { arrayToObject } from '../../utils/utils';

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

class AQLCodeBuildingContext {
    private boundValues: any[] = [];
    private variableBindings = new Map<AQLVariable, string>();
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
        if (!label || !aql.isSafeIdentifier(label)) {
            // bail out
            label = AQLCodeBuildingContext.DEFAULT_LABEL;
        }
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

    getOrAddVariable(token: AQLVariable): string {
        const existingBinding = this.variableBindings.get(token);
        if (existingBinding != undefined) {
            return existingBinding;
        }
        const safeLabel = AQLCodeBuildingContext.getSafeLabel(token.label);
        const newIndex = this.nextIndexPerLabel.get(safeLabel) || 0;
        this.nextIndexPerLabel.set(safeLabel, newIndex + 1);
        const newBinding = AQLCodeBuildingContext.getVarName(safeLabel, newIndex);
        this.variableBindings.set(token, newBinding);
        return newBinding;
    }

    getBoundValueMap() {
        return arrayToObject(this.boundValues, (_, index) => AQLCodeBuildingContext.getBoundValueName(index));
    }
}

export abstract class AQLFragment {
    toString(): string {
        return this.toStringWithContext(new AQLCodeBuildingContext());
    }

    toColoredString(): string {
        return this.toColoredStringWithContext(new AQLCodeBuildingContext());
    }

    getCode() {
        const context = new AQLCodeBuildingContext();
        const code = this.getCodeWithContext(context);
        return {
            code,
            boundValues: context.getBoundValueMap()
        };
    }

    isEmpty() {
        return false;
    }

    abstract toStringWithContext(context: AQLCodeBuildingContext): string
    abstract toColoredStringWithContext(context: AQLCodeBuildingContext): string
    abstract getCodeWithContext(context: AQLCodeBuildingContext): string;
}

class AQLCodeFragment extends AQLFragment {
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
        return this.toStringWithContext(context);
    }

    getCodeWithContext(context: AQLCodeBuildingContext): string {
        return indentLineBreaks(this.aql, context.indentationLevel);
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
        return this.toStringWithContext(context).blue;
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
        return this.toString().magenta;
    }

    getCodeWithContext(context: AQLCodeBuildingContext): string {
        return '@' + context.bindValue(this.value);
    }
}

export class AQLCompoundFragment extends AQLFragment {
    constructor(public readonly fragments: AQLFragment[]) {
        super();
    }

    isEmpty() {
        return this.fragments.length == 0 || this.fragments.every(fr => fr.isEmpty());
    }

    toStringWithContext(context: AQLCodeBuildingContext): string {
        return this.fragments.map(fr => fr.toStringWithContext(context)).join('');
    }

    toColoredStringWithContext(context: AQLCodeBuildingContext): string {
        return this.fragments.map(fr => fr.toColoredStringWithContext(context)).join('');
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
        context.indentationLevel++;
        const code = INDENTATION + this.fragment.getCodeWithContext(context);
        context.indentationLevel--;
        return code;
    }
}

export function aql(strings: ReadonlyArray<string>, ...values: any[]): AQLFragment {
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
            } else {
                fragments.push(new AQLBoundValue(value));
            }
        }
    }

    return new AQLCompoundFragment(fragments);
}

export namespace aql {
    export function join(fragments: AQLFragment[], separator: AQLFragment): AQLFragment {
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

    export function lines(...fragments: AQLFragment[]) {
        return join(fragments, aql`\n`);
    }

    export function indent(fragment: AQLFragment) {
        return new AQLIndentationFragment(fragment);
    }

    export function variable(label?: string): AQLFragment {
        return new AQLVariable(label);
    }

    export function collection(name: string): AQLFragment {
        if (!isSafeIdentifier(name)) {
            throw new Error(`Possibly invalid/unsafe collection name: ${name}`);
        }
        // TODO make sure this does not collide with a variable, maybe use bound vars?
        return code(name);
    }

    export function identifier(name: string): AQLFragment {
        if (!isSafeIdentifier(name)) {
            throw new Error(`Possibly invalid/unsafe identifier in AQL: ${name}`);
        }
        return code(name);
    }

    /**
     * Should be used when fairly certain that string can't be malicious
     *
     * As the string is json-encoded, it *should* be fine in any case, but still, user-supplied strings in queries is scary
     */
    export function string(str: string): AQLFragment {
        return code(JSON.stringify(str));
    }

    export function isSafeIdentifier(str: string) {
        // being pessimistic for security reasons
        // TODO collisions with collection names / keywords?
        return str.match(/^[a-zA-Z0-9_]+$/);
    }
}
