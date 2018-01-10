import { FieldRequest } from '../graphql/query-distiller';
import { GraphQLObjectType } from 'graphql';
import {
    CountQueryNode, ObjectQueryNode, PropertySpecification, QueryNode, TransformListQueryNode, VariableQueryNode
} from './definition';
import { createFilterNode } from './filtering';
import { COUNT_META_FIELD, FILTER_ARG } from '../schema/schema-defaults';
import { decapitalize } from '../utils/utils';
import { QueryTreeContext } from './query-tree-base';

export function createListMetaNode(fieldRequest: FieldRequest, listNode: QueryNode, objectType: GraphQLObjectType, context: QueryTreeContext) {
    const itemVarNode = new VariableQueryNode(decapitalize(objectType.name));

    if (FILTER_ARG in fieldRequest.args) {
        const filterNode = createFilterNode(fieldRequest.args[FILTER_ARG], objectType, itemVarNode, context);
        listNode = new TransformListQueryNode({
            listNode,
            filterNode,
            itemVariable: itemVarNode
        });
    }
    return new ObjectQueryNode(fieldRequest.selectionSet
        .map(selection => new PropertySpecification(selection.propertyName, createMetaFieldNode(selection.fieldRequest, listNode))));
}

function createMetaFieldNode(fieldRequest: FieldRequest, listNode: QueryNode) {
    switch (fieldRequest.fieldName) {
        case COUNT_META_FIELD:
            return new CountQueryNode(listNode);
        default:
            throw new Error(`Unsupported meta field: ${fieldRequest.fieldName}`);
    }
}
