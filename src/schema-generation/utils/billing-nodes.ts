import { GraphQLBoolean, GraphQLFloat, GraphQLInt } from 'graphql';
import { BillingEntityType } from '../../model';
import {
    ConditionalQueryNode,
    ConstBoolQueryNode,
    CountQueryNode,
    LiteralQueryNode,
    NullQueryNode,
    QueryNode,
    VariableAssignmentQueryNode,
    VariableQueryNode
} from '../../query-tree';
import { objectEntries } from '../../utils/utils';
import { createFieldPathNode } from '../field-path-node';
import { equal } from './input-types';

export function createBillingEntityCategoryNode(billingEntityConfig: BillingEntityType, entityNode: QueryNode) {
    if (billingEntityConfig.category != undefined) {
        return new LiteralQueryNode(billingEntityConfig.category);
    }
    if (
        !billingEntityConfig.categoryMapping ||
        !billingEntityConfig.categoryMappingFieldPath ||
        !billingEntityConfig.categoryMappingFieldPath.type
    ) {
        return new NullQueryNode();
    }

    const valueNode = createFieldPathNode(billingEntityConfig.categoryMappingFieldPath, entityNode);
    const valueVar = new VariableQueryNode('categoryMappingSource');
    let node: QueryNode = new LiteralQueryNode(billingEntityConfig.categoryMapping.defaultValue);
    for (const [key, value] of objectEntries(billingEntityConfig.categoryMapping.values)) {
        let keyNode: QueryNode = new LiteralQueryNode(key);
        if (billingEntityConfig.categoryMappingFieldPath.type.name === GraphQLBoolean.name) {
            if (key === 'true') {
                keyNode = ConstBoolQueryNode.TRUE;
            } else if (key === 'false') {
                keyNode = ConstBoolQueryNode.FALSE;
            } else if (key === 'null') {
                keyNode = NullQueryNode.NULL;
            }
        } else if (
            billingEntityConfig.categoryMappingFieldPath.type.name === GraphQLInt.name ||
            billingEntityConfig.categoryMappingFieldPath.type.name === GraphQLFloat.name
        ) {
            if (key === 'null') {
                keyNode = NullQueryNode.NULL;
            } else if (Number.isFinite(parseInt(key, 10))) {
                keyNode = new LiteralQueryNode(parseInt(key, 10));
            }
        }
        node = new ConditionalQueryNode(equal(valueVar, keyNode), new LiteralQueryNode(value), node);
    }
    return new VariableAssignmentQueryNode({
        variableValueNode: valueNode,
        variableNode: valueVar,
        resultNode: node
    });
}

export function createBillingEntityQuantityNode(billingEntityConfig: BillingEntityType, entityNode: QueryNode) {
    if (!billingEntityConfig.quantityFieldPath) {
        return NullQueryNode.NULL;
    }
    const valueNode = createFieldPathNode(billingEntityConfig.quantityFieldPath, entityNode);
    if (billingEntityConfig.quantityFieldPath.isList) {
        return new CountQueryNode(valueNode);
    }
    return valueNode;
}
