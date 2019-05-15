import { GraphQLError } from 'graphql';
import { RequestProfile } from '../config/interfaces';

export interface ExecutionResult {
    readonly data?: any;
    readonly error?: Error
    readonly profile?: RequestProfile
}
