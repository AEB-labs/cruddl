import { DistilledOperation, FieldRequest } from '../graphql/query-distiller';
import { NullQueryNode, ObjectQueryNode, PropertySpecification, QueryNode } from './definition';
import { MUTATION_TYPE, QUERY_TYPE } from '../schema/schema-defaults';
import { createQueryNamespaceNode } from './queries';
import { createMutationNamespaceNode } from './mutations';
import { globalContext } from '../config/global';
import { Model } from '../model';

/**
 * Creates a QueryTree that is used to instruct the DataBase how to perform a GraphQL query
 * @param {FieldRequest} operation the graphql query
 */
export function createQueryTree(operation: DistilledOperation, model: Model) {
    return new ObjectQueryNode(operation.selectionSet.map(
        sel => new PropertySpecification(sel.propertyName,
            createQueryNodeForField(sel.fieldRequest, model))));
}

function createQueryNodeForField(fieldRequest: FieldRequest, model: Model): QueryNode {
    switch (fieldRequest.parentType.name) {
        case QUERY_TYPE:
            return createQueryNamespaceNode(fieldRequest, [], model.rootNamespace);
        case MUTATION_TYPE:
            return createMutationNamespaceNode(fieldRequest, [], model.rootNamespace);
        default:
            globalContext.loggerProvider.getLogger('query-tree-builder').warn(`unknown root field: ${fieldRequest.fieldName}`);
            return new NullQueryNode();
    }
}
