import { indent as indentStr } from '../../utils/utils';
require('colors');

export class AQLVariable {
    public readonly name: string;

    constructor(name?: string) {
        if (!this.name) {
            this.name = tmpVarNames.nextName();
        }
    }
}

export class AQLFragment {
    constructor(public readonly code: string, public readonly bindValues: { [name: string]: any} = {}, public readonly variableNames: {[name: string]: boolean}) {

    }

    static concat(fragments: AQLFragment[]) {

    }

    /**
     * Note that this is only for display purposes, not necessary secure or sane
     * @returns {AQLFragment}
     */
    normalize() {
        const int1 = normalizeNumbers({
            map: this.bindValues,
            code: this.code
        }, bindValueNames.prefix, /@([a-z0-9]+)/g);
        const int2 = normalizeNumbers({
            map: this.variableNames,
            code: int1.code
        }, tmpVarNames.prefix, /\b([a-z0-9]+)\b/g);

        return new AQLFragment(int2.code, int1.map, int2.map);
    }

    toString() {
        return this.code.replace(/@([a-z0-9]+)/g, (_: any, name: string) => {
            if (!(name in this.bindValues)) {
                return '@name[MISSING]';
            }
            return JSON.stringify(this.bindValues[name])
        });
    }

    toColoredString() {
        return this.code.replace(/@([a-z0-9]+)/g, (_: any, name: string) => {
            if (!(name in this.bindValues)) {
                return '@name[MISSING]'.bgRed.white.bold;
            }
            return JSON.stringify(this.bindValues[name]).magenta;
        });
    }

    toPrettyString() {
        return this.normalize().toColoredString();
    }

    get prettyCode() {
        return this.normalize().code;
    }
}

interface NormalizationData<T> {
    map: {[name: string]: T}
    code: string
}
function normalizeNumbers<T>(data: NormalizationData<T>, prefix: string, regex: RegExp): NormalizationData<T> {
    const oldNumbers = Object.keys(data.map).map(name => parseInt(name.substr(bindValueNames.prefix.length), 0));
    const sortedOldNumbers = oldNumbers.sort((a, b) => a - b);
    const newNameByOldName: {[name: string]: string} = {};
    let newMap: {[name: string]: any} = {};
    let newNumber = 1;
    for (const oldNumber of sortedOldNumbers) {
        const newName = prefix + newNumber;
        const oldName = prefix + oldNumber;
        newNameByOldName[oldName] = newName;
        newMap[newName] = data.map[oldName];
        newNumber++;
    }
    const newCode = data.code.replace(regex, (_: any, name: string) => {
        if (!(name in newNameByOldName)) {
            return name;
        }
        return _.replace(name, newNameByOldName[name]);
    });
    return { map: newMap, code: newCode };
}

export function aql(strings: ReadonlyArray<string>, ...values: any[]) {
    let code = '';
    let bindValues: { [name: string]: any } = {};
    let variableNames: { [name: string]: boolean } = {};

    let snippets = [...strings];
    while (snippets.length || values.length) {
        if (snippets.length) {
            code += snippets.shift();
        }
        if (values.length) {
            const value = values.shift();
            if (value instanceof AQLFragment) {
                code += value.code;
                Object.assign(bindValues, value.bindValues);
                Object.assign(variableNames, value.variableNames);
            } else if (value instanceof AQLVariable) {
                code += value.name;
                variableNames[value.name] = true;
            } else {
                const bindVarName = bindValueNames.nextName();
                code += '@' + bindVarName;
                bindValues[bindVarName] = value;
            }
        }
    }

    return new AQLFragment(code, bindValues, variableNames);
}

export namespace aql {
    export function join(fragments: AQLFragment[], separator: AQLFragment) {
        let code = '';
        let bindValues: { [name: string]: any } = {};
        let variableNames: { [name: string]: boolean } = {};
        let isFirst = true;
        if (fragments.length) {
            Object.assign(bindValues, separator.bindValues);
            Object.assign(variableNames, separator.variableNames);
        }
        for (const fragment of fragments) {
            if (!isFirst) {
                code += separator.code;
            }
            isFirst = false;
            code += fragment.code;
            Object.assign(bindValues, fragment.bindValues);
            Object.assign(variableNames, fragment.variableNames);
        }
        return new AQLFragment(code, bindValues, variableNames);
    }

    export function code(code: string): AQLFragment {
        return new AQLFragment(code, {}, {});
    }

    export function lines(...fragments: AQLFragment[]) {
        return join(fragments, aql`\n`);
    }

    export function indent(fragment: AQLFragment) {
        return new AQLFragment(indentStr(fragment.code), fragment.bindValues, fragment.variableNames);
    }

    export function variable() {
        return aql`${new AQLVariable()}`;
    }

    export function collection(name: string) {
        if (!isSafeIdentifier(name)) {
            throw new Error(`Possibly invalid/unsafe collection name: ${name}`);
        }
        return code(name);
    }

    export function identifier(name: string) {
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
    export function string(str: string) {
        return code(JSON.stringify(str));
    }

    export function isSafeIdentifier(str: string) {
        // being pessimistic for security reasons
        return str.match(/^[a-zA-Z0-9-_]+$/);
    }
}

namespace bindValueNames {
    let current = 0;
    export const prefix = 'var';
    function nextIndex() {
        current++;
        return current;
    }
    export function nextName() {
        return prefix + nextIndex();
    }
}

namespace tmpVarNames {
    let current = 0;
    export const prefix = 'tmp';
    function nextIndex() {
        current++;
        return current;
    }
    export function nextName() {
        return prefix + nextIndex();
    }
}
