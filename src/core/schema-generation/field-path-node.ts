import { FieldPath } from '../model/implementation/field-path.js';
import type { Field } from '../model/implementation/field.js';
import type { QueryNode } from '../query-tree/base.js';
import { ListQueryNode } from '../query-tree/lists.js';
import { LiteralQueryNode, NullQueryNode } from '../query-tree/literals.js';
import { MergeObjectsQueryNode, ObjectQueryNode } from '../query-tree/objects.js';
import { SafeListQueryNode } from '../query-tree/type-check.js';
import { createFieldNode } from './field-nodes.js';

export function createFieldPathNode(
    fieldsOrFieldPath: ReadonlyArray<Field> | FieldPath,
    sourceNode: QueryNode,
) {
    let fields: ReadonlyArray<Field>;
    if (fieldsOrFieldPath instanceof FieldPath) {
        if (!fieldsOrFieldPath.fields) {
            throw new Error(
                `Used field path with validation errors in runtime ("${fieldsOrFieldPath.path}")`,
            );
        }
        fields = fieldsOrFieldPath.fields;
    } else {
        fields = fieldsOrFieldPath;
    }

    let node = sourceNode;
    for (const field of fields) {
        node = getFieldOfMergedObjectNode(field, node) ?? createFieldNode(field, node);
    }
    return node;
}

/**
 * If objectNode merges objects with statically known properties, gets the value of the field without
 * evaluating the merge
 *
 * This avoids copying whole objects (e.g. MERGE(doc, { field: value }).field just evaluates to value)
 *
 * @returns the value node, or undefined if this is not possible
 */
function getFieldOfMergedObjectNode(field: Field, objectNode: QueryNode): QueryNode | undefined {
    if (!(objectNode instanceof MergeObjectsQueryNode)) {
        return undefined;
    }

    // MERGE is not recursive, so the last object that has the property wins
    const objectNodes = objectNode.objectNodes;
    for (let index = objectNodes.length - 1; index >= 0; index--) {
        const node = objectNodes[index];
        if (!(node instanceof ObjectQueryNode)) {
            if (index === objectNodes.length - 1) {
                // nothing to simplify
                return undefined;
            }
            const remainingNodes = objectNodes.slice(0, index + 1);
            const remainingObjectNode =
                remainingNodes.length === 1
                    ? remainingNodes[0]
                    : new MergeObjectsQueryNode(remainingNodes);
            return (
                getFieldOfMergedObjectNode(field, remainingObjectNode) ??
                createFieldNode(field, remainingObjectNode)
            );
        }

        const property = node.properties.find((p) => p.propertyName === field.name);
        if (property) {
            const valueNode = property.valueNode;
            // keep the guarantee of createFieldNode that list fields evaluate to lists
            if (
                field.isList &&
                !(valueNode instanceof ListQueryNode) &&
                !(valueNode instanceof LiteralQueryNode && Array.isArray(valueNode.value))
            ) {
                return new SafeListQueryNode(valueNode);
            }
            return valueNode;
        }
    }

    // none of the objects has the property
    return field.isList ? ListQueryNode.EMPTY : NullQueryNode.NULL;
}
