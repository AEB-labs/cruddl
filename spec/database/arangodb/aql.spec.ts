import { aql, AQLVariable } from '../../../src/database/arangodb/aql';

describe('aql', () => {
    it('works with plain code', () => {
        const fragment = aql`RETURN true`;
        expect(fragment.code).toBe('RETURN true');
        expect(fragment.toString()).toBe('RETURN true');
        expect(fragment.bindValues).toEqual({});
    });

    it('works with simple values', () => {
        const fragment = aql`RETURN ${{ flag: true }}`;
        expect(fragment.code).toMatch(/RETURN @([a-z0-9]+)/);
        expect(fragment.toString()).toEqual('RETURN {"flag":true}');
        expect(Object.keys(fragment.bindValues).length).toEqual(1);
        expect(fragment.bindValues[Object.keys(fragment.bindValues)[0]]).toEqual({ flag: true });
        console.log(fragment.toColoredString());
    });

    it('can nest fragments', () => {
        const innerFragment = aql`{ flag: ${true} }`;
        const fragment = aql`RETURN [ ${123}, ${innerFragment} ]`;
        expect(fragment.code).toMatch(/RETURN [ @([a-z0-9]+, { flag: @([a-z0-9]+) } ]/);
        expect(fragment.toString()).toEqual('RETURN [ 123, { flag: true } ]');
        expect(Object.keys(fragment.bindValues).length).toEqual(2);
        expect(fragment.bindValues[Object.keys(fragment.bindValues).sort()[0]]).toEqual(true);
        expect(fragment.bindValues[Object.keys(fragment.bindValues).sort()[1]]).toEqual(123);
        console.log(fragment.toColoredString());
    });

    it('can normalize var names', () => {
        const innerFragment = aql`{ flag: ${true} }`;
        const fragment = aql`RETURN [ ${123}, ${innerFragment} ]`;
        const normalized = fragment.normalize();
        expect(normalized.code).toEqual('RETURN [ @var2, { flag: @var1 } ]');
        expect(normalized.bindValues).toEqual({var1: true, var2: 123});
    });

    it('can join lines', () => {
        const fragment = aql.lines(
            aql`{`,
            aql`  flag: ${true}`,
            aql`}`
        );
        expect(fragment.normalize().code).toEqual('{\n  flag: @var1\n}');
        expect(fragment.toString()).toEqual('{\n  flag: true\n}');
        console.log(fragment.toColoredString());
    });

    it('can indent lines', () => {
        const items = [123, 456, 42].map(number => aql`2 * ${number}`);
        const fragment = aql.lines(
            aql`[`,
            aql.indent(aql.join(items, aql`,\n`)),
            aql`]`);
        expect(fragment.normalize().code).toEqual('[\n  2 * @var1,\n  2 * @var2,\n  2 * @var3\n]');
        console.log(fragment.toColoredString());
    });

    it('supports tmp vars', () => {
        const tmp1 = aql.variable();
        const fragment = aql`FOR ${tmp1} IN [ 1, 2, 3 ] RETURN ${tmp1} * 2`;
        expect(Object.keys(fragment.variableNames).length).toBe(1);
    });

    it('supports multiple tmp vars', () => {
        const tmp1 = aql.variable();
        const tmp2 = aql.variable();
        const fragment = aql`LET ${tmp1} = [ 1, 2, 3] FOR ${tmp2} IN ${tmp1} RETURN ${tmp2} * 2`;
        expect(Object.keys(fragment.variableNames).length).toBe(2);
    });

    it('normalizes tmp vars', () => {
        const tmp1 = aql.variable();
        const tmp2 = aql.variable();
        const fragment = aql`LET ${tmp1} = [ 1, 2, 3] FOR ${tmp2} IN ${tmp1} RETURN ${tmp2} * 2`;
        expect(Object.keys(fragment.normalize().variableNames)).toEqual(['tmp1', 'tmp2']);
        console.log(fragment.normalize().toColoredString());
    });

    describe('collection', () => {
        it('accepts normal names', () => {
            expect(aql.collection('deliveries').code).toEqual('deliveries');
        });

        it('rejects strange collection names', () => {
            expect(() =>aql.collection('deliveries + / BAD')).toThrow();
        })
    })
});
