import { ValueNode } from 'graphql';
import { BOOLEAN, ENUM, FLOAT, INT, LIST, OBJECT, STRING } from './kinds';
import { PlainObject } from '../utils/utils';

/**
 * Gets the value of a ValueNode
 *
 * Like valueFromAST from graphqljs, but without typechecking so it does not need the input type
 */
export function getValueFromAST(valueNode: ValueNode): any {
    switch (valueNode.kind) {
        case STRING:
        case INT:
        case FLOAT:
        case BOOLEAN:
        case ENUM:
            return valueNode.value;
        case LIST:
            return [...valueNode.values.map((value) => getValueFromAST(value))];
        case OBJECT:
            const obj: PlainObject = {};
            valueNode.fields.forEach((field) => {
                obj[field.name.value] = getValueFromAST(field.value);
            });
            return obj;
        default:
            return undefined;
    }
}
