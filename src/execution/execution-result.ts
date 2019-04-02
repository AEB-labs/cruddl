import { GraphQLError } from 'graphql';
import { RequestProfile } from '../project/project';

export interface ExecutionResult {
    readonly data?: any;
    readonly errors?: ReadonlyArray<GraphQLError>
    readonly profile?: RequestProfile
}
