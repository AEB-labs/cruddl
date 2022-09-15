import { Kind, ValueNode } from 'graphql';
import { PlainObject } from '../utils/utils';

/**
 * Gets the value of a ValueNode
 *
 * Like valueFromAST from graphqljs, but without typechecking so it does not need the input type
 */
export function getValueFromAST(valueNode: ValueNode): any {
    switch (valueNode.kind) {
        case Kind.STRING:
        case Kind.INT:
        case Kind.FLOAT:
        case Kind.BOOLEAN:
        case Kind.ENUM:
            return valueNode.value;
        case Kind.LIST:
            return [...valueNode.values.map((value) => getValueFromAST(value))];
        case Kind.OBJECT:
            const obj: PlainObject = {};
            valueNode.fields.forEach((field) => {
                obj[field.name.value] = getValueFromAST(field.value);
            });
            return obj;
        default:
            return undefined;
    }
}
