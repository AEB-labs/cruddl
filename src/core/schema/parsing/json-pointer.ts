export function toJsonPointer(path: ReadonlyArray<string | number>): string {
    // https://datatracker.ietf.org/doc/html/rfc6901
    return path.map((part) => '/' + escapeJsonPointer(String(part))).join('');
}

function escapeJsonPointer(part: string): string {
    // defined by https://datatracker.ietf.org/doc/html/rfc6901#section-3
    return part.replace(/~/g, '~0').replace(/\//g, '~1');
}
