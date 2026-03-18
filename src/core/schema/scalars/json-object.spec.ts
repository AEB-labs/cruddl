import { Kind } from 'graphql';
import { describe, expect, it } from 'vitest';
import { GraphQLJSONObject } from './json-object.js';

describe('GraphQLJSONObject', () => {
    describe('parseLiteral', () => {
        it('parses simple JSON objects', () => {
            const parsed = GraphQLJSONObject.parseLiteral(
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

        it('parses nested objects', () => {
            const parsed = GraphQLJSONObject.parseLiteral(
                {
                    kind: Kind.OBJECT,
                    fields: [
                        {
                            kind: Kind.OBJECT_FIELD,
                            name: { kind: Kind.NAME, value: 'obj' },
                            value: {
                                kind: Kind.OBJECT,
                                fields: [
                                    {
                                        kind: Kind.OBJECT_FIELD,
                                        name: { kind: Kind.NAME, value: 'a' },
                                        value: { kind: Kind.STRING, value: 'b' },
                                    },
                                ],
                            },
                        },
                    ],
                },
                undefined,
            );
            expect(parsed).to.deep.equal({ obj: { a: 'b' } });
        });

        it('parses variables', () => {
            const parsed = GraphQLJSONObject.parseLiteral(
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
                { bar: { x: 1 } },
            );
            expect(parsed).to.deep.equal({ foo: { x: 1 } });
        });
    });

    describe('parseValue', () => {
        it('accepts a plain object', () => {
            const input = { a: 1, b: 'c' };
            const result = GraphQLJSONObject.parseValue(input);
            expect(result).to.equal(input);
        });

        it('throws on arrays', () => {
            expect(() => GraphQLJSONObject.parseValue([1, 2, 3])).to.throw(
                'JSONObject cannot represent non-object value: 1,2,3',
            );
        });

        it('throws on non-objects', () => {
            expect(() => GraphQLJSONObject.parseValue(123)).to.throw(
                'JSONObject cannot represent non-object value: 123',
            );
            expect(() => GraphQLJSONObject.parseValue(null)).to.throw(
                'JSONObject cannot represent non-object value: null',
            );
            expect(() => GraphQLJSONObject.parseValue('foo')).to.throw(
                'JSONObject cannot represent non-object value: foo',
            );
        });
    });

    describe('serialize', () => {
        it('returns the value as is for objects', () => {
            const input = { foo: 'bar' };
            const result = GraphQLJSONObject.serialize(input);
            expect(result).to.equal(input);
        });

        it('throws on arrays', () => {
            expect(() => GraphQLJSONObject.serialize([1, 2, 3])).to.throw(
                'JSONObject cannot represent non-object value: 1,2,3',
            );
        });

        it('throws on non-objects', () => {
            expect(() => GraphQLJSONObject.serialize(123)).to.throw(
                'JSONObject cannot represent non-object value: 123',
            );
            expect(() => GraphQLJSONObject.serialize(null)).to.throw(
                'JSONObject cannot represent non-object value: null',
            );
            expect(() => GraphQLJSONObject.serialize('foo')).to.throw(
                'JSONObject cannot represent non-object value: foo',
            );
        });
    });
});
