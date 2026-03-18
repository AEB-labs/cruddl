import { describe, expect, it } from 'vitest';
import { LiteralQueryNode } from '../core/query-tree/literals.js';
import { ObjectQueryNode, PropertySpecification } from '../core/query-tree/objects.js';
import { getAQLQuery } from './aql-generator.js';

describe('getAQLForQuery', () => {
    it('supports LiteralQuery', () => {
        const query = new LiteralQueryNode({ some: 'object' });
        const aql = getAQLQuery(query);
        expect(aql.getExecutableQueries()[0].code).to.equal(`RETURN @var1`);
    });

    it('supports ObjectQuery', () => {
        const query = new ObjectQueryNode([
            new PropertySpecification('propA', new LiteralQueryNode('a')),
            new PropertySpecification('propB', new LiteralQueryNode('b')),
        ]);
        const aql = getAQLQuery(query);
        expect(aql.getExecutableQueries()[0].code).to.equal(
            `RETURN {\n"propA": @var1,\n"propB": @var2\n}`,
        );
    });
});
