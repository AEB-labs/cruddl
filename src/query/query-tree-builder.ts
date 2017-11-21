import { DistilledOperation, FieldRequest } from '../graphql/query-distiller';
import { LiteralQueryNode, NullQueryNode, ObjectQueryNode, PropertySpecification, QueryNode } from './definition';
import { MUTATION_TYPE, QUERY_TYPE } from '../schema/schema-defaults';
import { createQueryNamespaceNode } from './queries';
import { createMutationNamespaceNode } from './mutations';
import {globalContext} from '../config/global';

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
            return createQueryNamespaceNode(fieldRequest, []);
        case MUTATION_TYPE:
            return createMutationNamespaceNode(fieldRequest, []);
        default:
            globalContext.loggerProvider.getLogger('Momo QTBuilder').warn(`unknown root field: ${fieldRequest.fieldName}`);
            return new NullQueryNode();
    }
}
