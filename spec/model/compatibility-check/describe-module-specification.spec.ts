import { expect } from 'chai';
import { describeModuleSpecification } from '../../../src/model/compatibility-check/describe-module-specification';
import { EffectiveModuleSpecification } from '../../../src/model/implementation/modules/effective-module-specification';

describe('describeModuleSpecification', () => {
    it('describes empty spec', () => {
        const result = describeModuleSpecification(EffectiveModuleSpecification.EMPTY, {
            preposition: 'by',
        });
        expect(result).to.equal('');
    });

    it('describes one module', () => {
        const result = describeModuleSpecification(
            new EffectiveModuleSpecification({
                orCombinedClauses: [
                    {
                        andCombinedModules: ['module1'],
                    },
                ],
            }),
            { preposition: 'by' },
        );
        expect(result).to.equal('by module "module1"');
    });

    it('describes two or-combined modules', () => {
        const result = describeModuleSpecification(
            new EffectiveModuleSpecification({
                orCombinedClauses: [
                    {
                        andCombinedModules: ['module1'],
                    },
                    {
                        andCombinedModules: ['module2'],
                    },
                ],
            }),
            { preposition: 'by' },
        );
        expect(result).to.equal('by module "module1" and "module2"');
    });

    it('describes three or-combined modules', () => {
        const result = describeModuleSpecification(
            new EffectiveModuleSpecification({
                orCombinedClauses: [
                    {
                        andCombinedModules: ['module1'],
                    },
                    {
                        andCombinedModules: ['module2'],
                    },
                    {
                        andCombinedModules: ['module3'],
                    },
                ],
            }),
            { preposition: 'by' },
        );
        expect(result).to.equal('by module "module1", "module2" and "module3"');
    });

    it('describes one combination of two modules', () => {
        const result = describeModuleSpecification(
            new EffectiveModuleSpecification({
                orCombinedClauses: [
                    {
                        andCombinedModules: ['module1', 'module2'],
                    },
                ],
            }),
            { preposition: 'by' },
        );
        expect(result).to.equal('by the combination of module "module1" and "module2"');
    });

    it('describes one combination of three modules', () => {
        const result = describeModuleSpecification(
            new EffectiveModuleSpecification({
                orCombinedClauses: [
                    {
                        andCombinedModules: ['module1', 'module2', 'module3'],
                    },
                ],
            }),
            { preposition: 'by' },
        );
        expect(result).to.equal('by the combination of module "module1", "module2" and "module3"');
    });

    it('describes three modules and one combination of two modules', () => {
        const result = describeModuleSpecification(
            new EffectiveModuleSpecification({
                orCombinedClauses: [
                    {
                        andCombinedModules: ['a'],
                    },
                    {
                        andCombinedModules: ['b'],
                    },
                    {
                        andCombinedModules: ['c'],
                    },
                    {
                        andCombinedModules: ['module1', 'module2'],
                    },
                ],
            }),
            { preposition: 'by' },
        );
        expect(result).to.equal(
            'by module "a", "b" and "c", and by the combination of module "module1" and "module2"',
        );
    });

    it('describes three modules and one combination of three modules', () => {
        const result = describeModuleSpecification(
            new EffectiveModuleSpecification({
                orCombinedClauses: [
                    {
                        andCombinedModules: ['a'],
                    },
                    {
                        andCombinedModules: ['b'],
                    },
                    {
                        andCombinedModules: ['c'],
                    },
                    {
                        andCombinedModules: ['module1', 'module2', 'module3'],
                    },
                ],
            }),
            { preposition: 'by' },
        );
        expect(result).to.equal(
            'by module "a", "b" and "c", and by the combination of module "module1", "module2" and "module3"',
        );
    });

    it('describes three modules and two combinations of modules', () => {
        const result = describeModuleSpecification(
            new EffectiveModuleSpecification({
                orCombinedClauses: [
                    {
                        andCombinedModules: ['a'],
                    },
                    {
                        andCombinedModules: ['b'],
                    },
                    {
                        andCombinedModules: ['c'],
                    },
                    {
                        andCombinedModules: ['module1', 'module2'],
                    },
                    {
                        andCombinedModules: ['module3', 'module4', 'module5'],
                    },
                ],
            }),
            { preposition: 'by' },
        );
        expect(result).to.equal(
            'by module "a", "b" and "c", and by the combination of module "module1" and "module2", and by the combination of module "module3", "module4" and "module5"',
        );
    });

    it('describes two combinations of modules', () => {
        const result = describeModuleSpecification(
            new EffectiveModuleSpecification({
                orCombinedClauses: [
                    {
                        andCombinedModules: ['module1', 'module2'],
                    },
                    {
                        andCombinedModules: ['module3', 'module4', 'module5'],
                    },
                ],
            }),
            { preposition: 'by' },
        );
        expect(result).to.equal(
            'by the combination of module "module1" and "module2", and by the combination of module "module3", "module4" and "module5"',
        );
    });
});
