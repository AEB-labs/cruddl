import { GraphQLError } from 'graphql';
import { RequestProfile } from '../project/project';

export interface ExecutionResult {
    data?: any;
    errors?: ReadonlyArray<GraphQLError>
    profile?: RequestProfile
}
