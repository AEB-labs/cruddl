import { getAQLForQuery } from '../../../src/database/arangodb/aql-generator';
import { LiteralQueryNode, ObjectQueryNode, PropertySpecification } from '../../../src/query/definition';

describe('getAQLForQuery', () => {
    it('supports LiteralQuery', () => {
        const query = new LiteralQueryNode({some: 'object'});
        const aql = getAQLForQuery(query);
        console.log(aql.toPrettyString());
        expect(aql.prettyCode).toEqual(`RETURN @var1`);
    });

    it('supports ObjectQuery', () => {
        const query = new ObjectQueryNode([
            new PropertySpecification('propA', new LiteralQueryNode('a')),
            new PropertySpecification('propB', new LiteralQueryNode('b')),
        ]);
        const aql = getAQLForQuery(query);
        console.log(aql.toPrettyString());
        expect(aql.prettyCode).toEqual(`RETURN {\n  "propA": @var1,\n  "propB": @var2\n}`);
    });
});