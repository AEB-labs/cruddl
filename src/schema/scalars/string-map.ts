import { ASTNode, GraphQLScalarType, Kind } from 'graphql';

function ensureStringMap(value: any) {
    if (typeof value !== 'object' || value === null || Array.isArray(value)) {
        throw new TypeError(`Expected object value`);
    }
    let hasClonedValue = false;
    for (const propKey of Object.keys(value)) {
        const propVal = value[propKey];
        if (propVal == null) {
            if (!hasClonedValue) {
                value = { ...value };
                hasClonedValue = true;
            }
            delete value[propKey];
        } else if (typeof propVal !== 'string') {
            throw new TypeError(
                `Expected value of property ${JSON.stringify(propKey)} to be a string`,
            );
        }
    }

    return value;
}

function parseStringMap(ast: ASTNode, variables: { [key: string]: unknown } | null | undefined) {
    if (ast.kind !== Kind.OBJECT) {
        throw new TypeError(`Expected object value`);
    }

    const value = Object.create(null);
    for (const field of ast.fields) {
        switch (field.value.kind) {
            case 'StringValue':
                value[field.name.value] = field.value.value;
                break;
            case 'Variable':
                const variableValue = variables ? variables[field.value.name.value] : undefined;
                if (variableValue == null) {
                    break;
                }
                if (typeof variableValue !== 'string') {
                    throw new TypeError(
                        `Expected value of property ${JSON.stringify(
                            field.name.value,
                        )} to be a string`,
                    );
                }
                value[field.name.value] = variableValue;
                break;
            case 'NullValue':
                // we allow this but silently discard of it
                break;
            default:
                throw new TypeError(
                    `Expected value of property ${JSON.stringify(field.name.value)} to be a string`,
                );
        }
    }
    return value;
}

export const GraphQLStringMap = new GraphQLScalarType({
    name: 'StringMap',
    description: `The \"StringMap\" scalar type consists of a JSON object with only strings as values.

This type can be used for key-value mappings where fetching keys without values or values without keys does not make sense. For arbitrary maps, the \"JSONObject\" type can be used instead.

Values are *not* additionally JSON-encoded or JSON-parsed, so e.g. pass a raw JSON object here instead of a JSON-representation of that object.`,
    serialize: ensureStringMap,
    parseValue: ensureStringMap,
    parseLiteral: parseStringMap,
});

export const GraphQLI18nString = new GraphQLScalarType({
    name: 'I18nString',
    description: `The \"I18nString\" scalar type represents an internationalized string.

    Structurally, the \"I18nString\`" type is equivalent to the \"StringMap\" type. Keys are ISO 639-1 language codes, and values are the localized strings. In the future, more specific features may be added to this type, so it is preferred over the \"StringMap\" type to represent internationalized strings.

    Values are *not* additionally JSON-encoded or JSON-parsed, so e.g. pass a raw JSON object here instead of a JSON-representation of that object.`,
    serialize: ensureStringMap,
    parseValue: ensureStringMap,
    parseLiteral: parseStringMap,
});
