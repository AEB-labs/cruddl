/**
 * Is thrown if a ArangoSearchMigration is performed, in a context where it is not supported,
 * e.g. when the in-memory database is used, or the Arango-Version is not >3.4
 */
export class ArangoSearchMigrationNotSupportedError extends Error {
    constructor() {
        super(`ArangoSearch-migration was not executed, because it requires an ArangoDB of the version 3.4 or higher.`);
        this.name = this.constructor.name;
    }
}