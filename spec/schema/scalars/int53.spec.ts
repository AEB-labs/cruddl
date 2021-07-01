import { expect } from 'chai';
import { GraphQLInt53 } from '../../../src/schema/scalars/int53';

describe('Int53', () => {
    describe('parseLiteral', () => {
        it('accepts positive ints', () => {
            expect(GraphQLInt53.parseLiteral({ kind: 'IntValue', value: '123' }, {})).to.equal(123);
        });

        it('accepts negative ints', () => {
            expect(GraphQLInt53.parseLiteral({ kind: 'IntValue', value: '-9007199254740991' }, {})).to.equal(
                -9007199254740991
            );
        });

        it('rejects floats', () => {
            expect(() => GraphQLInt53.parseLiteral({ kind: 'FloatValue', value: '123.4' }, {})).to.throw(
                'Int53 cannot represent non-integer value: 123.4'
            );
        });

        it('rejects numeric strings', () => {
            expect(() => GraphQLInt53.parseLiteral({ kind: 'StringValue', value: '123' }, {})).to.throw(
                'Int53 cannot represent non-integer value: "123"'
            );
        });

        it('rejects ints that are too large', () => {
            expect(() => GraphQLInt53.parseLiteral({ kind: 'IntValue', value: '9007199254740992' }, {})).to.throw(
                'Int53 cannot represent value larger than 9007199254740991: 9007199254740992'
            );
        });

        it('rejects ints that are too small', () => {
            expect(() => GraphQLInt53.parseLiteral({ kind: 'IntValue', value: '-9007199254740992' }, {})).to.throw(
                'Int53 cannot represent value smaller than -9007199254740991: -9007199254740992'
            );
        });
    });

    describe('coerce', () => {
        it('accepts positive integers', () => {
            expect(GraphQLInt53.parseValue(123)).to.equal(123);
        });

        it('accepts negative integers', () => {
            expect(GraphQLInt53.parseValue(-9007199254740991)).to.equal(-9007199254740991);
        });

        it('rejects fractional values', () => {
            expect(() => GraphQLInt53.parseValue(123.4)).to.throw('Int53 cannot represent non-integer value: 123.4');
        });

        it('rejects ints that are too large', () => {
            expect(() => GraphQLInt53.parseValue(9007199254740992)).to.throw(
                'Int53 cannot represent value larger than 9007199254740991: 9007199254740992'
            );
        });

        it('rejects ints that are too small', () => {
            expect(() => GraphQLInt53.parseValue(-9007199254740992)).to.throw(
                'Int53 cannot represent value smaller than -9007199254740991: -9007199254740992'
            );
        });
    });
});
