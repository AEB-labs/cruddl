import { Field } from '../model';
import { FieldPath } from '../model/implementation/field-path';
import { QueryNode } from '../query-tree';
import { createFieldNode } from './field-nodes';

export function createFieldPathNode(fieldsOrFieldPath: ReadonlyArray<Field> | FieldPath, sourceNode: QueryNode) {
    let fields: ReadonlyArray<Field>;
    if (fieldsOrFieldPath instanceof FieldPath) {
        if (!fieldsOrFieldPath.fields) {
            throw new Error(`Used field path with validation errors in runtime ("${fieldsOrFieldPath.path}")`);
        }
        fields = fieldsOrFieldPath.fields;
    } else {
        fields = fieldsOrFieldPath;
    }

    let node = sourceNode;
    for (const field of fields) {
        node = createFieldNode(field, node);
    }
    return node;
}
