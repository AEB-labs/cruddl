import { RequestProfile } from '../config/interfaces.js';

export interface ExecutionResult {
    readonly data?: any;
    readonly error?: Error;
    readonly profile?: RequestProfile;
}
