export function isArangoDBDisabled() {
    return process.argv.includes('--db=in-memory');
}
