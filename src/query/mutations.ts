import { FieldRequest } from '../graphql/query-distiller';
import { GraphQLObjectType } from 'graphql';
import {
    ContextAssignmentQueryNode, ContextQueryNode, CreateEntityQueryNode, LiteralQueryNode, QueryNode
} from './definition';
import { CREATE_ENTITY_FIELD_PREFIX, CREATE_INPUT_ARG } from '../schema/schema-defaults';
import { createEntityObjectNode } from './queries';

/**
 * Creates a QueryNode for a field of the root mutation type
 * @param {FieldRequest} fieldRequest the mutation field, such as createSomeEntity
 */
export function createMutationRootNode(fieldRequest: FieldRequest): QueryNode {
    if (fieldRequest.fieldName.startsWith(CREATE_ENTITY_FIELD_PREFIX)) {
        return createCreateEntityQueryNode(fieldRequest, [fieldRequest]);
    }

    console.log(`unknown field: ${fieldRequest.fieldName}`);
    return new LiteralQueryNode(null);
}

function createCreateEntityQueryNode(fieldRequest: FieldRequest, fieldRequestStack: FieldRequest[]): QueryNode {
    const entityName = fieldRequest.fieldName.substr('create'.length);
    const entityType = fieldRequest.schema.getTypeMap()[entityName];
    if (!entityType || !(entityType instanceof GraphQLObjectType)) {
        throw new Error(`Object type ${entityName} not found but needed for field ${fieldRequest.fieldName}`);
    }
    const input = fieldRequest.args[CREATE_INPUT_ARG];
    const objectNode = new LiteralQueryNode(input);
    const createEntityNode = new CreateEntityQueryNode(entityType, objectNode);
    const resultNode = createEntityObjectNode(fieldRequest.selectionSet, new ContextQueryNode(), fieldRequestStack);
    return new ContextAssignmentQueryNode(createEntityNode, resultNode);
}
