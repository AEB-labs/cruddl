/**
 * Prepares an object map of argument values given a list of argument
 * definitions and list of argument AST nodes.
 *
 * Note: The returned value is a plain Object with a prototype, since it is
 * exposed to user code. Care should be taken to not pull values from the
 * Object prototype.
 */
import {
    DirectiveNode,
    FieldNode,
    GraphQLDirective,
    GraphQLError,
    GraphQLField,
    valueFromAST,
    VariableNode,
    print,
    GraphQLNonNull,
} from 'graphql';
import { arrayToObject } from '../utils/utils';

export function getArgumentValues(
    def: GraphQLField<any, any> | GraphQLDirective,
    node: FieldNode | DirectiveNode,
    variableValues?: { [key: string]: any } | undefined,
): { [key: string]: any } {
    const coercedValues: { [key: string]: any } = {};
    const argDefs = def.args;
    const argNodes = node.arguments;
    if (!argDefs || !argNodes) {
        return coercedValues;
    }
    const argNodeMap = arrayToObject(argNodes, (arg) => arg.name.value);
    for (let i = 0; i < argDefs.length; i++) {
        const argDef = argDefs[i];
        const name = argDef.name;
        const argType = argDef.type;
        const argumentNode = argNodeMap[name];
        const defaultValue = argDef.defaultValue;
        if (!argumentNode) {
            if (!isInvalid(defaultValue)) {
                coercedValues[name] = defaultValue;
            } else if (argType instanceof GraphQLNonNull) {
                throw new GraphQLError(
                    `Argument "${name}" of required type ` +
                        `"${String(argType)}" was not provided.`,
                    [node],
                );
            }
        } else if (argumentNode.value.kind === 'Variable') {
            const variableName = argumentNode.value.name.value;
            if (
                variableValues &&
                Object.prototype.hasOwnProperty.call(variableValues, variableName) &&
                !isInvalid(variableValues[variableName])
            ) {
                // Note: this does not check that this variable value is correct.
                // This assumes that this query has been validated and the variable
                // usage here is of the correct type.
                coercedValues[name] = variableValues[variableName];
            } else if (!isInvalid(defaultValue)) {
                coercedValues[name] = defaultValue;
            } else if (argType instanceof GraphQLNonNull) {
                throw new GraphQLError(
                    `Argument "${name}" of required type "${String(argType)}" was ` +
                        `provided the variable "$${variableName}" which was not provided ` +
                        'a runtime value.',
                    [argumentNode.value],
                );
            }
        } else {
            const valueNode = argumentNode.value;
            const coercedValue = valueFromAST(valueNode, argType, variableValues);
            if (isInvalid(coercedValue)) {
                // Note: ValuesOfCorrectType validation should catch this before
                // execution. This is a runtime check to ensure execution does not
                // continue with an invalid argument value.
                throw new GraphQLError(
                    `Argument "${name}" has invalid value ${print(valueNode)}.`,
                    [argumentNode.value],
                );
            }
            coercedValues[name] = coercedValue;
        }
    }
    return coercedValues;
}

function isInvalid(value: any): boolean {
    return value === undefined || value !== value;
}
