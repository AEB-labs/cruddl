declare module 'json-source-map' {
    export function parse(json: string): {
        data: any
        pointers: Pointers
    }

    export function stringify(data: any, _: any, space: number): {
        json: any,
        pointers: Pointers
    }

    export type Pointers = { [path: string]: Pointer }

    export type Pointer = {
        key: Location
        keyEnd: Location
        value: Location
        valueEnd: Location
    }

    export type Location = {
        line: number
        column: number
        pos: number
    }
}
