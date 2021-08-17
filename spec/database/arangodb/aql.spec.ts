import { expect } from 'chai';
import { aql, aqlConfig, AQLVariable } from '../../../src/database/arangodb/aql';

describe('aql', () => {
    it('works with plain code', () => {
        const fragment = aql`RETURN true`;
        expect(fragment.getCode().code).to.equal('RETURN true');
        expect(fragment.toString()).to.equal('RETURN true');
        expect(fragment.getCode().boundValues).to.be.deep.equal({});
    });

    it('works with simple values', () => {
        const fragment = aql`RETURN ${123}`;
        expect(fragment.getCode().code).to.equal('RETURN @var1');
        expect(fragment.toString()).to.equal('RETURN 123');
        const boundValues = fragment.getCode().boundValues;
        expect(Object.keys(boundValues).length).to.equal(1);
        expect(boundValues.var1).to.be.deep.equal(123);
        console.log(fragment.toColoredString());
    });

    it('can nest fragments', () => {
        const innerFragment = aql`{ flag: ${true} }`;
        const fragment = aql`RETURN [ ${123}, ${innerFragment} ]`;
        expect(fragment.getCode().code).to.equal('RETURN [ @var1, { flag: @var2 } ]');
        expect(fragment.toString()).to.equal('RETURN [ 123, { flag: true } ]');
        const boundValues = fragment.getCode().boundValues;
        expect(Object.keys(boundValues).length).to.equal(2);
        expect(boundValues.var1).to.equal(123);
        expect(boundValues.var2).to.equal(true);
        console.log(fragment.toColoredString());
    });

    it('can join lines', () => {
        const fragment = aql.lines(aql`{`, aql`  flag: ${true}`, aql`}`);
        expect(fragment.getCode().code).to.equal('{\n  flag: @var1\n}');
        expect(fragment.toString()).to.equal('{\n  flag: true\n}');
        console.log(fragment.toColoredString());
    });

    it('can indent lines', () => {
        const items = [123, 456, 42].map(number => aql`2 * ${number}`);
        const fragment = aql.lines(aql`[`, aql.indent(aql.join(items, aql`,\n`)), aql`]`);
        const oldValue = aqlConfig.enableIndentationForCode;
        aqlConfig.enableIndentationForCode = true;
        expect(fragment.getCode().code).to.equal('[\n  2 * @var1,\n  2 * @var2,\n  2 * @var3\n]');
        aqlConfig.enableIndentationForCode = oldValue;
        console.log(fragment.toColoredString());
    });

    it('supports tmp vars', () => {
        const tmp1 = aql.variable();
        const fragment = aql`FOR ${tmp1} IN [ 1, 2, 3 ] RETURN ${tmp1} * 2`;
        expect(fragment.getCode().code).to.equal(`FOR tmp1 IN [ 1, 2, 3 ] RETURN tmp1 * 2`);
    });

    it('supports multiple tmp vars', () => {
        const tmp1 = aql.variable();
        const tmp2 = aql.variable();
        const fragment = aql`LET ${tmp1} = [ 1, 2, 3] FOR ${tmp2} IN ${tmp1} RETURN ${tmp2} * 2`;
        expect(fragment.getCode().code).to.equal(`LET tmp1 = [ 1, 2, 3] FOR tmp2 IN tmp1 RETURN tmp2 * 2`);
    });

    it('discards unsafe variable labels', () => {
        const tmp1 = new AQLVariable('unsafe label');
        const fragment = aql`LET ${tmp1} = true RETURN ${tmp1}`;
        expect(fragment.getCode().code).to.equal(`LET tmp1 = true RETURN tmp1`);
    });

    it('supports multiple labeled tmp vars', () => {
        const tmp1 = new AQLVariable('label');
        const tmp2 = new AQLVariable('label');
        const fragment = aql`LET ${tmp1} = [ 1, 2, 3] FOR ${tmp2} IN ${tmp1} RETURN ${tmp2} * 2`;
        expect(fragment.getCode().code).to.equal(
            `LET v_label1 = [ 1, 2, 3] FOR v_label2 IN v_label1 RETURN v_label2 * 2`
        );
    });

    describe('collection', () => {
        it('accepts normal names', () => {
            expect(aql.collection('deliveries').getCode().code).to.equal('@@deliveries');
        });

        it('rejects strange collection names', () => {
            expect(() => aql.collection('deliveries + / BAD')).to.throw();
        });
    });
});
