import { arrayToObject, indent } from '../../utils/utils';

export class AQLFragment {
    constructor(public code: string, public variables: { [name: string]: any} = {}) {

    }

    static concat(fragments: AQLFragment[]) {

    }

    normalize() {
        const oldNumbers = Object.keys(this.variables).map(name => parseInt(name.substr(bindVarNames.prefix.length)));
        const sortedOldNumbers = oldNumbers.sort();
        const newNameByOldName: {[name: string]: string} = {};
        let newVariables: {[name: string]: any} = {};
        let newNumber = 1;
        for (const oldNumber of sortedOldNumbers) {
            const newName = bindVarNames.prefix + newNumber;
            const oldName = bindVarNames.prefix + oldNumber;
            newNameByOldName[oldName] = newName;
            newVariables[newName] = this.variables[oldName];
            newNumber++;
        }
        const newCode = this.code.replace(/@([a-z0-9]+)/g, (_: any, name: string) => {
            if (!(name in newNameByOldName)) {
                return name;
            }
            return '@' + newNameByOldName[name];
        });
        return new AQLFragment(newCode, newVariables);
    }

    toString() {
        return this.code.replace(/@([a-z0-9]+)/g, (_: any, name: string) => {
            if (!(name in this.variables)) {
                return '@name[MISSING]';
            }
            return JSON.stringify(this.variables[name])
        });
    }

    toColoredString() {
        return this.code.replace(/@([a-z0-9]+)/g, (_: any, name: string) => {
            if (!(name in this.variables)) {
                return '@name[MISSING]'.bgRed.white.bold;
            }
            return JSON.stringify(this.variables[name]).magenta;
        });
    }
}

export function aqlLines(...fragments: AQLFragment[]) {
    return aqlJoin(fragments, aql`\n`);
}

export function aqlJoin(fragments: AQLFragment[], separator: AQLFragment) {
    let code = '';
    let variables: { [name: string]: any } = {};
    let isFirst = true;
    if (fragments.length) {
        Object.assign(variables, separator.variables);
    }
    for (const fragment of fragments) {
        if (!isFirst) {
            code += separator.code;
        }
        isFirst = false;
        code += fragment.code;
        Object.assign(variables, fragment.variables);
    }
    return new AQLFragment(code, variables);
}

export function aqlIndent(fragment: AQLFragment) {
    return new AQLFragment(indent(fragment.code), fragment.variables);
}

export function aql(strings: ReadonlyArray<string>, ...values: any[]) {
    let code = '';
    let variables: { [name: string]: any } = {};

    let snippets = [...strings];
    while (snippets.length || values.length) {
        if (snippets.length) {
            code += snippets.shift();
        }
        if (values.length) {
            const value = values.shift();
            if (value instanceof AQLFragment) {
                code += value.code;
                Object.assign(variables, value.variables);
            } else {
                const bindVarName = bindVarNames.nextName();
                code += '@' + bindVarName;
                variables[bindVarName] = value;
            }
        }
    }

    return new AQLFragment(code, variables);
}

namespace bindVarNames {
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
