export type PlainObject = { [key: string]: AnyValue };
export type AnyValue = unknown;
export type Constructor<T> = { new (...args: ReadonlyArray<any>): T };

export function flatMap<TOut, TIn>(
    arr: ReadonlyArray<TIn>,
    f: (t: TIn) => ReadonlyArray<TOut>,
): ReadonlyArray<TOut> {
    return arr.reduce((ys: any, x: any) => {
        return ys.concat(f.call(null, x));
    }, []);
}

/**
 * Maps an array and returns the first defined result. Undefined elements in array will be ignored.
 * @param {ReadonlyArray<TIn>} array.
 * @param {(t: TIn) => TOut} fn
 * @returns TOut|undefined
 */
export function mapFirstDefined<TIn, TOut>(
    array: ReadonlyArray<TIn | undefined>,
    fn: (t: TIn) => TOut,
) {
    for (const i of array) {
        if (i == undefined) {
            continue;
        }
        const out = fn(i);
        if (out != undefined) {
            return out;
        }
    }
    return undefined;
}

export function flatten<T>(arr: ReadonlyArray<ReadonlyArray<T>>): ReadonlyArray<T> {
    return arr.reduce((ys: any, x: any) => {
        return ys.concat(x);
    }, []);
}

/**
 * Check if {array} starts with {start}
 * @param {ReadonlyArray<T>} array
 * @param {ReadonlyArray<T>} start
 * @returns {boolean}
 */
export function arrayStartsWith<T>(array: ReadonlyArray<T>, start: ReadonlyArray<T>): boolean {
    let i = 0;
    while (i < start.length) {
        if (array[i] !== start[i]) {
            return false;
        }
        i++;
    }
    return true;
}

export function capitalize(string: string) {
    return string.charAt(0).toUpperCase() + string.slice(1);
}

export function decapitalize(string: string) {
    return string.charAt(0).toLowerCase() + string.slice(1);
}

/**
 * Groups items in an array by common keys
 * @param items the input items
 * @param keyFn a function that computes the key value of an item
 * @returns {Map<TKey, ReadonlyArray<TItem>>} a map from key values to the list of items that have that key
 */
export function groupArray<TItem, TKey>(
    items: ReadonlyArray<TItem>,
    keyFn: (item: TItem) => TKey,
): Map<TKey, ReadonlyArray<TItem>> {
    const map = new Map<TKey, TItem[]>();
    for (const item of items) {
        const key = keyFn(item);
        let group = map.get(key);
        if (!group) {
            group = [];
            map.set(key, group);
        }
        group.push(item);
    }
    return map;
}

export const INDENTATION = '  ';

/**
 * Indents each line of a string with a given indentation
 * @param input the string to indent
 * @param indentation the prefix to put in front of each line
 * @returns the indented string
 */
export function indent(input: string, indentation: string | number = INDENTATION) {
    if (indentation === 0 || indentation === '') {
        return input;
    }
    if (typeof indentation == 'number') {
        indentation = INDENTATION.repeat(indentation);
    }
    return input
        .split('\n')
        .map((line) => indentation + line)
        .join('\n');
}

/**
 * Creates an array of the form [0, 1, 2, ..., count-1]
 *
 * @param count the number of items for the array
 * @returns the array
 */
export function range(count: number): ReadonlyArray<number> {
    return Array.from(Array(count).keys());
}

/**
 * Takes a random sample of an array
 * @param arr the source population
 * @returns the sampled item, or undefined if the input array is empty
 */
export function takeRandomSample<T>(arr: ReadonlyArray<T>): T | undefined {
    return arr[Math.floor(Math.random() * arr.length)];
}

export function arrayToObject<TValue>(
    array: ReadonlyArray<TValue>,
    keyFn: (item: TValue, index: number) => string,
): { [name: string]: TValue } {
    const result: { [name: string]: TValue } = {};
    for (let i = 0; i < array.length; i++) {
        result[keyFn(array[i], i)] = array[i];
    }
    return result;
}

export function compact<T>(arr: ReadonlyArray<T | undefined | null>): ReadonlyArray<T> {
    return arr.filter((a) => a != undefined) as ReadonlyArray<T>;
}

export function objectValues<T>(obj: { [name: string]: T }): ReadonlyArray<T> {
    return Object.keys(obj).map((i) => obj[i]);
}

export function objectEntries<T>(obj: { [name: string]: T }): [string, T][] {
    return Object.keys(obj).map((k): [string, T] => [k, obj[k]]);
}

export function mapValues<TIn, TOut>(
    obj: { [key: string]: TIn },
    fn: (value: TIn, key: string) => TOut,
): { [key: string]: TOut };
export function mapValues<TIn, TOut, TKey>(
    map: Map<TKey, TIn>,
    fn: (value: TIn, key: TKey) => TOut,
): Map<TKey, TOut>;
export function mapValues<TIn, TOut, TKey>(
    obj: { [key: string]: TIn } | Map<TKey, TIn>,
    fn: (value: TIn, key: TKey) => TOut,
): Map<TKey, TOut> | { [key: string]: TOut } {
    if (obj instanceof Map) {
        return mapValues1(obj, fn);
    }
    return mapValues0(obj, fn as any as (value: TIn, key: string) => TOut);
}

function mapValues0<TIn, TOut>(
    obj: { [key: string]: TIn },
    fn: (value: TIn, key: string) => TOut,
): { [key: string]: TOut } {
    const result: { [key: string]: TOut } = {};
    for (const key in obj) {
        result[key] = fn(obj[key], key);
    }
    return result;
}

function mapValues1<TIn, TOut, TKey>(
    map: Map<TKey, TIn>,
    fn: (value: TIn, key: TKey) => TOut,
): Map<TKey, TOut> {
    const result = new Map<TKey, TOut>();
    for (const [key, value] of map.entries()) {
        result.set(key, fn(value, key));
    }
    return result;
}

export function sleep(ms: number) {
    return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Gets a promise that resolves with `true` after a specified time, except when a cancellation promise fires first, then
 * it resolves with `false`.
 *
 * If the cancellation token is rejected, the sleep continues as normal.
 *
 * @param ms the sleep time in milliseconds
 * @param cancellationToken a promise that should be resolved to cancel the timeout
 */
export function sleepInterruptible(
    ms: number,
    cancellationToken: Promise<void> | undefined,
): Promise<boolean> {
    let resolvePromise: (result: boolean) => void;
    let isCancelled = false;
    const promise = new Promise<boolean>((r) => (resolvePromise = r));
    const timeout = setTimeout(() => {
        if (!isCancelled) {
            resolvePromise(true);
        }
    }, ms);
    if (cancellationToken) {
        cancellationToken.then(() => {
            isCancelled = true;
            resolvePromise(false);
            clearTimeout(timeout);
        });
    }
    return promise;
}

export let escapeRegExp: (input: string) => string;
(function () {
    // Referring to the table here:
    // https://developer.mozilla.org/en/JavaScript/Reference/Global_Objects/regexp
    // these characters should be escaped
    // \ ^ $ * + ? . ( ) | { } [ ]
    // These characters only have special meaning inside of brackets
    // they do not need to be escaped, but they MAY be escaped
    // without any adverse effects (to the best of my knowledge and casual testing)
    // : ! , =
    // my test "~!@#$%^&*(){}[]`/=?+\|-_;:'\",<.>".match(/[\#]/g)

    // source: https://stackoverflow.com/questions/3446170/escape-string-for-use-in-javascript-regex

    const specials = [
            // order matters for these
            '-',
            '[',
            ']',
            // order doesn't matter for any of these
            '/',
            '{',
            '}',
            '(',
            ')',
            '*',
            '+',
            '?',
            '.',
            '\\',
            '^',
            '$',
            '|',
        ],
        // I choose to escape every character with '\'
        // even though only some strictly require it when inside of []
        regex = RegExp('[' + specials.join('\\') + ']', 'g');
    escapeRegExp = function (str) {
        return str.replace(regex, '\\$&');
    };

    // test escapeRegExp("/path/to/res?search=this.that")
})();

export function isPromise<T>(value: any): value is Promise<T> {
    return typeof value === 'object' && value !== null && typeof value.then === 'function';
}

export function joinWithAnd(items: ReadonlyArray<string>): string {
    if (items.length <= 2) {
        return items.join(' and ');
    }
    const upToSecondLast = items.slice();
    const last = upToSecondLast.pop();
    return upToSecondLast.join(', ') + ', and ' + last;
}

/**
 * Checks if a value is an array using Array.isArray()
 *
 * The runtime behavior is identical to Array.is.Array(), but it fixes a shortcoming of TypeScript if the
 * passed value is a union of a readonly array and something else. Array.isArray() would narrow the value
 * to Array<any> instead of ReadonlyArray<T> (see https://github.com/microsoft/TypeScript/issues/17002).
 */
export function isReadonlyArray<T>(obj: unknown | ReadonlyArray<T>): obj is ReadonlyArray<T> {
    return Array.isArray(obj);
}
