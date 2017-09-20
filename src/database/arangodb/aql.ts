export class AQLFragment {
    constructor(public code: string, public variables: { [name: string]: any} = {}) {

    }

    static concat(fragments: AQLFragment[]) {

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
    const prefix = 'var';
    function nextIndex() {
        current++;
        return current;
    }
    export function nextName() {
        return prefix + nextIndex();
    }
}
