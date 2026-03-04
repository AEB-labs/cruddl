import { Kind } from 'graphql';
import { describe, expect, it } from 'vitest';
import { GraphQLJSON } from './json.js';

describe('GraphQLJSON', () => {
    describe('parseLiteral', () => {
        it('parses simple JSON objects', () => {
            const parsed = GraphQLJSON.parseLiteral(
                {
                    kind: Kind.OBJECT,
                    fields: [
                        {
                            kind: Kind.OBJECT_FIELD,
                            name: { kind: Kind.NAME, value: 'foo' },
                            value: { kind: Kind.STRING, value: 'bar' },
                        },
                        {
                            kind: Kind.OBJECT_FIELD,
                            name: { kind: Kind.NAME, value: 'num' },
                            value: { kind: Kind.INT, value: '42' },
                        },
                    ],
                },
                undefined,
            );
            expect(parsed).to.deep.equal({ foo: 'bar', num: 42 });
        });

        it('parses arrays', () => {
            const parsed = GraphQLJSON.parseLiteral(
                {
                    kind: Kind.LIST,
                    values: [
                        { kind: Kind.STRING, value: 'a' },
                        { kind: Kind.INT, value: '1' },
                        { kind: Kind.BOOLEAN, value: true },
                    ],
                },
                undefined,
            );
            expect(parsed).to.deep.equal(['a', 1, true]);
        });

        it('parses nested objects and arrays', () => {
            const parsed = GraphQLJSON.parseLiteral(
                {
                    kind: Kind.OBJECT,
                    fields: [
                        {
                            kind: Kind.OBJECT_FIELD,
                            name: { kind: Kind.NAME, value: 'arr' },
                            value: {
                                kind: Kind.LIST,
                                values: [
                                    { kind: Kind.STRING, value: 'x' },
                                    { kind: Kind.INT, value: '2' },
                                ],
                            },
                        },
                        {
                            kind: Kind.OBJECT_FIELD,
                            name: { kind: Kind.NAME, value: 'obj' },
                            value: {
                                kind: Kind.OBJECT,
                                fields: [
                                    {
                                        kind: Kind.OBJECT_FIELD,
                                        name: { kind: Kind.NAME, value: 'a' },
                                        value: { kind: Kind.BOOLEAN, value: false },
                                    },
                                ],
                            },
                        },
                    ],
                },
                undefined,
            );
            expect(parsed).to.deep.equal({ arr: ['x', 2], obj: { a: false } });
        });

        it('parses variables', () => {
            const parsed = GraphQLJSON.parseLiteral(
                {
                    kind: Kind.OBJECT,
                    fields: [
                        {
                            kind: Kind.OBJECT_FIELD,
                            name: { kind: Kind.NAME, value: 'foo' },
                            value: {
                                kind: Kind.VARIABLE,
                                name: { kind: Kind.NAME, value: 'bar' },
                            },
                        },
                    ],
                },
                { bar: 123 },
            );
            expect(parsed).to.deep.equal({ foo: 123 });
        });
    });

    describe('parseValue', () => {
        it('accepts any JSON value', () => {
            const input = { a: 1, b: [2, 3], c: { d: 'e' } };
            const result = GraphQLJSON.parseValue(input);
            expect(result).to.equal(input);
        });
    });

    describe('serialize', () => {
        it('returns the value as is', () => {
            const input = { foo: 'bar', arr: [1, 2, 3] };
            const result = GraphQLJSON.serialize(input);
            expect(result).to.equal(input);
        });
    });
});
