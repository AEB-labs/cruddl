import { getAQLQuery } from '../../../src/database/arangodb/aql-generator';
import { LiteralQueryNode, ObjectQueryNode, PropertySpecification } from '../../../src/query/definition';

describe('getAQLForQuery', () => {
    it('supports LiteralQuery', () => {
        const query = new LiteralQueryNode({some: 'object'});
        const aql = getAQLQuery(query);
        expect(aql.getExecutableQueries()[0].code).toEqual(`RETURN @var1`);
    });

    it('supports ObjectQuery', () => {
        const query = new ObjectQueryNode([
            new PropertySpecification('propA', new LiteralQueryNode('a')),
            new PropertySpecification('propB', new LiteralQueryNode('b')),
        ]);
        const aql = getAQLQuery(query);
        expect(aql.getExecutableQueries()[0].code).toEqual(`RETURN {\n  "propA": @var1,\n  "propB": @var2\n}`);
    });
});