export function isArangoDBDisabled() {
    return process.env.CRUDDL_DB === 'in-memory';
}
