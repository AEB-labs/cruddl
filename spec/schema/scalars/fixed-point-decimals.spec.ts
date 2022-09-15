import { expect } from 'chai';
import { Kind } from 'graphql/language';
import { GraphQLDecimal2 } from '../../../src/schema/scalars/fixed-point-decimals';

describe('Decimal2', () => {
    describe('parseLiteral', () => {
        it('accepts positive ints', () => {
            expect(GraphQLDecimal2.parseLiteral({ kind: Kind.INT, value: '123' }, {})).to.equal(
                123,
            );
        });

        it('accepts negative ints', () => {
            expect(
                GraphQLDecimal2.parseLiteral({ kind: Kind.INT, value: '-1000000000' }, {}),
            ).to.equal(-1000000000);
        });

        it('accepts numbers with one decimal digit', () => {
            expect(GraphQLDecimal2.parseLiteral({ kind: Kind.FLOAT, value: '123.4' }, {})).to.equal(
                123.4,
            );
        });

        it('accepts numbers with two decimal digits', () => {
            expect(
                GraphQLDecimal2.parseLiteral({ kind: Kind.FLOAT, value: '123.45' }, {}),
            ).to.equal(123.45);
        });

        it('rounds numbers with more than two decimal digits', () => {
            const value = 123.456789;
            const coerced = 123.46;
            expect(coerced).to.not.equal(value); // just to be sure...
            expect(
                GraphQLDecimal2.parseLiteral({ kind: Kind.FLOAT, value: '123.456789' }, {}),
            ).to.equal(123.46);
        });

        it('rounds numbers with more than two decimal digits if it fits within the range after rounding', () => {
            expect(
                GraphQLDecimal2.parseLiteral({ kind: Kind.FLOAT, value: '1000000000.001' }, {}),
            ).to.equal(1000000000);
        });

        it('rejects numeric strings', () => {
            expect(() =>
                GraphQLDecimal2.parseLiteral({ kind: Kind.STRING, value: '123' }, {}),
            ).to.throw('Decimal2 cannot represent non numeric value: "123"');
        });

        it('rejects numbers that are too large', () => {
            expect(() =>
                GraphQLDecimal2.parseLiteral({ kind: Kind.INT, value: '1000000001' }, {}),
            ).to.throw('Decimal2 cannot represent value larger than 1000000000.00: 1000000001');
        });

        it('rejects numbers that are too small', () => {
            expect(() =>
                GraphQLDecimal2.parseLiteral({ kind: Kind.INT, value: '-1000000000.1' }, {}),
            ).to.throw(
                'Decimal2 cannot represent value smaller than -1000000000.00: -1000000000.1',
            );
        });
    });

    describe('coerce', () => {
        it('accepts positive integers', () => {
            expect(GraphQLDecimal2.parseValue(123)).to.equal(123);
        });

        it('accepts negative integers', () => {
            expect(GraphQLDecimal2.parseValue(-1000000000)).to.equal(-1000000000);
        });

        it('accepts numbers with one decimal digit', () => {
            expect(GraphQLDecimal2.parseValue(123.4)).to.equal(123.4);
        });

        it('accepts numbers with two decimal digits', () => {
            expect(GraphQLDecimal2.parseValue(123.45)).to.equal(123.45);
        });

        it('rounds numbers with more than two decimal digits', () => {
            expect(GraphQLDecimal2.parseValue(123.456789)).to.equal(123.46);
        });

        it('rounds numbers with more than two decimal digits if it fits within the range after rounding', () => {
            expect(GraphQLDecimal2.parseValue(1000000000.001)).to.equal(1000000000);
        });

        it('rejects ints that are too large', () => {
            expect(() => GraphQLDecimal2.parseValue(1000000001)).to.throw(
                'Decimal2 cannot represent value larger than 1000000000.00: 1000000001',
            );
        });

        it('rejects ints that are too small', () => {
            expect(() => GraphQLDecimal2.parseValue(-1000000000.1)).to.throw(
                'Decimal2 cannot represent value smaller than -1000000000.00: -1000000000.1',
            );
        });
    });
});
