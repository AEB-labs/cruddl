import {
    EffectiveModuleSpecification,
    EffectiveModuleSpecificationClause,
} from '../../../src/model/implementation/modules/effective-module-specification';
import { expect } from 'chai';

describe('EffectiveModuleSpecification', () => {
    describe('simplify()', () => {
        it('removes duplicate simple clauses', () => {
            const input = new EffectiveModuleSpecification({
                orCombinedClauses: [
                    new EffectiveModuleSpecificationClause({ andCombinedModules: ['a'] }),
                    new EffectiveModuleSpecificationClause({ andCombinedModules: ['b'] }),
                    new EffectiveModuleSpecificationClause({ andCombinedModules: ['a'] }),
                ],
            });
            const output = input.simplify();
            expect(output.toString()).to.equal('a, b');
        });

        it('removes duplicate multi-module clauses', () => {
            const input = new EffectiveModuleSpecification({
                orCombinedClauses: [
                    new EffectiveModuleSpecificationClause({ andCombinedModules: ['a', 'c'] }),
                    new EffectiveModuleSpecificationClause({ andCombinedModules: ['b'] }),
                    new EffectiveModuleSpecificationClause({ andCombinedModules: ['a', 'c'] }),
                ],
            });
            const output = input.simplify();
            expect(output.toString()).to.equal('b, a && c');
        });

        it('removes redundant clauses', () => {
            const input = new EffectiveModuleSpecification({
                orCombinedClauses: [
                    new EffectiveModuleSpecificationClause({ andCombinedModules: ['a', 'c'] }),
                    new EffectiveModuleSpecificationClause({ andCombinedModules: ['b'] }),
                    new EffectiveModuleSpecificationClause({ andCombinedModules: ['a', 'c', 'd'] }),
                ],
            });
            const output = input.simplify();
            expect(output.toString()).to.equal('b, a && c');
        });

        it('works with a more complicated case', () => {
            const input = new EffectiveModuleSpecification({
                orCombinedClauses: [
                    new EffectiveModuleSpecificationClause({ andCombinedModules: ['shipping'] }),
                    new EffectiveModuleSpecificationClause({
                        andCombinedModules: ['shipping', 'dangerous_goods'],
                    }),
                    new EffectiveModuleSpecificationClause({
                        andCombinedModules: ['tms', 'dangerous_goods'],
                    }),
                    new EffectiveModuleSpecificationClause({
                        andCombinedModules: ['shipping', 'dangerous_goods', 'extra1'],
                    }),
                    new EffectiveModuleSpecificationClause({
                        andCombinedModules: ['tms', 'dangerous_goods', 'extra1'],
                    }),
                    new EffectiveModuleSpecificationClause({
                        andCombinedModules: ['extra1'],
                    }),
                ],
            });
            const output = input.simplify();
            expect(output.toString()).to.equal('extra1, shipping, dangerous_goods && tms');
        });
    });
});
