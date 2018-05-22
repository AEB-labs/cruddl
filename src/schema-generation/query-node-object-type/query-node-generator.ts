import { FieldRequest, FieldSelection } from '../../graphql/query-distiller';
import {
    BasicType, ConditionalQueryNode, ListQueryNode, NullQueryNode, ObjectQueryNode, PropertySpecification, QueryNode,
    TransformListQueryNode,
    TypeCheckQueryNode, VariableQueryNode
} from '../../query-tree';
import { extractQueryTreeObjectType, isListType, QueryNodeField, QueryNodeObjectType } from './index';

export function buildSafeObjectQueryNode(sourceNode: QueryNode, type: QueryNodeObjectType, selectionSet: ReadonlyArray<FieldSelection>) {
    return new ConditionalQueryNode(
        new TypeCheckQueryNode(sourceNode, BasicType.OBJECT),
        buildObjectQueryNode(sourceNode, type, selectionSet),
        new NullQueryNode());
}

export function buildObjectQueryNode(sourceNode: QueryNode, type: QueryNodeObjectType, selectionSet: ReadonlyArray<FieldSelection>) {
    // TODO build a map of the fields by name somewhere
    return new ObjectQueryNode(selectionSet.map(sel => {
        const field = type.fields.find(f => f.name == sel.fieldRequest.fieldName);
        if (!field) {
            throw new Error(`Missing field ${sel.fieldRequest.fieldName}`);
        }
        let fieldQueryNode = buildFieldQueryNode(sourceNode, field, sel.fieldRequest);
        const queryTreeObjectType = extractQueryTreeObjectType(field.type);

        // see if we need to map the selection set
        if (queryTreeObjectType) {
            if (isListType(field.type)) {
                fieldQueryNode = buildSafeObjectQueryNode(fieldQueryNode, queryTreeObjectType, sel.fieldRequest.selectionSet);
            } else {
                fieldQueryNode = buildSafeTransformListQueryNode(fieldQueryNode, queryTreeObjectType, sel.fieldRequest.selectionSet);
            }
        }

        return new PropertySpecification(sel.propertyName, fieldQueryNode);
    }));
}

function buildFieldQueryNode(sourceNode: QueryNode, field: QueryNodeField, fieldRequest: FieldRequest): QueryNode {
    return field.resolve(sourceNode, fieldRequest.args);
}

export function buildSafeTransformListQueryNode(listNode: QueryNode, itemType: QueryNodeObjectType, selectionSet: ReadonlyArray<FieldSelection>): QueryNode {
    const safeList = buildSafeListQueryNode(listNode);
    const itemVariable = new VariableQueryNode(itemType.name);
    const innerNode = buildObjectQueryNode(itemVariable, itemType, selectionSet);
    return new TransformListQueryNode({
        listNode: safeList,
        innerNode,
        itemVariable
    });
}

export function buildSafeListQueryNode(listNode: QueryNode) {
    // to avoid errors because of eagerly evaluated list expression, we just convert non-lists to an empty list
    return new ConditionalQueryNode(
        new TypeCheckQueryNode(listNode, BasicType.LIST),
        listNode,
        new ListQueryNode([])
    );
}
