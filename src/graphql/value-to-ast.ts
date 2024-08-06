import { Kind, ObjectFieldNode, ValueNode } from 'graphql';

export function createValueNodeFromValue(value: unknown): ValueNode {
    if (value === null || value === undefined) {
        return {
            kind: Kind.NULL,
        };
    }

    switch (typeof value) {
        case 'boolean':
            return {
                kind: Kind.BOOLEAN,
                value: value,
            };
        case 'number':
            return {
                kind: Number.isInteger(value) ? Kind.INT : Kind.FLOAT,
                value: value.toString(),
            };
        case 'bigint':
            return {
                kind: Kind.INT,
                value: value.toString(),
            };
        case 'string':
            return {
                kind: Kind.STRING,
                value,
            };
        case 'object':
            if (Array.isArray(value)) {
                return {
                    kind: Kind.LIST,
                    values: value.map((item) => createValueNodeFromValue(item)),
                };
            } else {
                return {
                    kind: Kind.OBJECT,
                    fields: Object.entries(value).map(
                        ([key, value]): ObjectFieldNode => ({
                            kind: Kind.OBJECT_FIELD,
                            name: {
                                kind: Kind.NAME,
                                value: key,
                            },
                            value: createValueNodeFromValue(value),
                        }),
                    ),
                };
            }
        default:
            throw new Error(`Unsupported value type: ${typeof value}`);
    }
}
