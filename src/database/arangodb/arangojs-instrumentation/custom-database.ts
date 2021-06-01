import { Database } from 'arangojs';
import { Config } from 'arangojs/connection';
import { CustomConnection } from './custom-connection';

export class CustomDatabase extends Database {
    constructor(config?: Config) {
        super();
        // private field on Database set in super constructor
        (this as any)._connection = new CustomConnection(config);
    }
}
