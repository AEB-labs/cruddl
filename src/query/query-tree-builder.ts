import { DistilledOperation, FieldRequest } from '../graphql/query-distiller';
import { LiteralQueryNode, ObjectQueryNode, PropertySpecification, QueryNode } from './definition';
import { MUTATION_TYPE, QUERY_TYPE } from '../schema/schema-defaults';
import { createQueryRootNode } from './queries';
import { createMutationRootNode } from './mutations';

/**
 * Creates a QueryTree that is used to instruct the DataBase how to perform a GraphQL query
 * @param {FieldRequest} operation the graphql query
 */
export function createQueryTree(operation: DistilledOperation) {
    return new ObjectQueryNode(operation.selectionSet.map(
        sel => new PropertySpecification(sel.propertyName,
            createQueryNodeForField(sel.fieldRequest))));
}

function createQueryNodeForField(fieldRequest: FieldRequest): QueryNode {
    switch (fieldRequest.parentType.name) {
        case QUERY_TYPE:
            return createQueryRootNode(fieldRequest);
        case MUTATION_TYPE:
            return createMutationRootNode(fieldRequest);
        default:
            console.log(`unknown root field: ${fieldRequest.fieldName}`);
            return new LiteralQueryNode(null);
    }
}
