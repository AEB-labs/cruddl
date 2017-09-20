import { aql, aqlIndent, aqlJoin, aqlLines } from '../../../src/database/arangodb/aql';

describe('aql', () => {
    it('works with plain code', () => {
        const fragment = aql`RETURN true`;
        expect(fragment.code).toBe('RETURN true');
        expect(fragment.toString()).toBe('RETURN true');
        expect(fragment.variables).toEqual({});
    });

    it('works with simple values', () => {
        const fragment = aql`RETURN ${{ flag: true }}`;
        expect(fragment.code).toMatch(/RETURN @([a-z0-9]+)/);
        expect(fragment.toString()).toEqual('RETURN {"flag":true}');
        expect(Object.keys(fragment.variables).length).toEqual(1);
        expect(fragment.variables[Object.keys(fragment.variables)[0]]).toEqual({ flag: true });
        console.log(fragment.toColoredString());
    });

    it('can nest fragments', () => {
        const innerFragment = aql`{ flag: ${true} }`;
        const fragment = aql`RETURN [ ${123}, ${innerFragment} ]`;
        expect(fragment.code).toMatch(/RETURN [ @([a-z0-9]+, { flag: @([a-z0-9]+) } ]/);
        expect(fragment.toString()).toEqual('RETURN [ 123, { flag: true } ]');
        expect(Object.keys(fragment.variables).length).toEqual(2);
        expect(fragment.variables[Object.keys(fragment.variables).sort()[0]]).toEqual(true);
        expect(fragment.variables[Object.keys(fragment.variables).sort()[1]]).toEqual(123);
        console.log(fragment.toColoredString());
    });

    it('can normalize var names', () => {
        const innerFragment = aql`{ flag: ${true} }`;
        const fragment = aql`RETURN [ ${123}, ${innerFragment} ]`;
        const normalized = fragment.normalize();
        expect(normalized.code).toEqual('RETURN [ @var2, { flag: @var1 } ]');
        expect(normalized.variables).toEqual({var1: true, var2: 123});
    });

    it('can join lines', () => {
        const fragment = aqlLines(
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
        const fragment = aqlLines(
            aql`[`,
            aqlIndent(aqlJoin(items, aql`,\n`)),
            aql`]`);
        expect(fragment.normalize().code).toEqual('[\n  2 * @var1,\n  2 * @var2,\n  2 * @var3\n]');
        console.log(fragment.toColoredString());
    });
});
