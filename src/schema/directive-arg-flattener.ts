import {AnyValue, PlainObject} from "../utils/utils";
import {ValueNode, VariableNode} from "graphql";
import {BOOLEAN, ENUM, FLOAT, INT, LIST, NULL, OBJECT, STRING, VARIABLE} from "graphql/language/kinds";

export function flattenValueNode(valueNode: ValueNode): any {
    switch (valueNode.kind) {
        case STRING:
        case INT:
        case FLOAT:
        case BOOLEAN:
        case ENUM:
            return valueNode.value;
        case LIST:
            return [...valueNode.values.map(value => flattenValueNode(value))];
        case OBJECT:
            const obj: PlainObject = {};
            valueNode.fields.forEach(field => {
                obj[field.name.value] = flattenValueNode(field.value);
            });
            return obj;
        default:
            return undefined;
    }
}
