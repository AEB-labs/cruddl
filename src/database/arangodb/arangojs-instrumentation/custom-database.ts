import { Database } from 'arangojs';
import type { Config } from 'arangojs/connection.js';
import { CustomConnection } from './custom-connection.js';

export class CustomDatabase extends Database {
    constructor(config?: Config) {
        super(config);
        // private field on Database set in super constructor
        (this as any)._connection = new CustomConnection(config);
    }
}
