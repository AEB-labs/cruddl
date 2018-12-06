import { getAQLQuery } from '../../../src/database/arangodb/aql-generator';
import { LiteralQueryNode, ObjectQueryNode, PropertySpecification } from '../../../src/query-tree';
import { expect } from 'chai';

describe('getAQLForQuery', () => {
    it('supports LiteralQuery', () => {
        const query = new LiteralQueryNode({some: 'object'});
        const aql = getAQLQuery(query);
        expect(aql.getExecutableQueries()[0].code).to.equal(`RETURN @var1`);
    });

    it('supports ObjectQuery', () => {
        const query = new ObjectQueryNode([
            new PropertySpecification('propA', new LiteralQueryNode('a')),
            new PropertySpecification('propB', new LiteralQueryNode('b')),
        ]);
        const aql = getAQLQuery(query);
        expect(aql.getExecutableQueries()[0].code).to.equal(`RETURN {\n"propA": @var1,\n"propB": @var2\n}`);
    });
});