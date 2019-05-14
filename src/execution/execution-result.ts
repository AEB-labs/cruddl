import { GraphQLError } from 'graphql';
import { RequestProfile } from '../config/interfaces';

export interface ExecutionResult {
    readonly data?: any;
    readonly errors?: ReadonlyArray<GraphQLError>
    readonly profile?: RequestProfile
}
