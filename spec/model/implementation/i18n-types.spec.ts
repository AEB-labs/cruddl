import { expect } from 'chai';
import { Model, TypeKind } from '../../../src/model';
import { LocalizationConfig } from '../../../src/model/config/i18n';

const FULLY = 'fully';
const PARTIALLY = 'partially';
const NAMESPACED = 'namespaced';

const i18n: LocalizationConfig[] = [
    {
        language: FULLY,
        namespaceContent: {
            types: {
                A: {
                    singular: 'A_FULLY_SINGULAR',
                    plural: 'A_FULLY_PLURAL',
                    hint: 'A_FULLY_HINT'
                },
                B: {
                    singular: 'B_FULLY_SINGULAR',
                    plural: 'B_FULLY_PLURAL',
                    hint: 'B_FULLY_HINT'
                },
                // C is actually located in 'namespace' but translated in root here
                C: {
                    singular: 'C_FULLY_SINGULAR',
                    plural: 'C_FULLY_PLURAL',
                    hint: 'C_FULLY_HINT'
                }
            }
        },
        namespacePath: []
    },
    {
        language: PARTIALLY,
        namespaceContent: {
            types: {
                A: {
                    singular: 'A_PARTIALLY_SINGULAR',
                },
                // B missing
                // C is actually located in 'namespace' but translated in root here
                C: {
                    singular: 'C_PARTIALLY_SINGULAR'
                }
            }
        },
        namespacePath: []
    },
    {
        language: NAMESPACED,
        namespacePath: [],
        namespaceContent: {
            namespaces: {
                namespace: {
                    types: {
                        // A is not namespaced in model, this localization must never be used
                        A: {
                            singular: 'A_NAMESPACED_SINGULAR',
                            plural: 'A_NAMESPACED_PLURAL',
                            hint: 'A_NAMESPACED_HINT'
                        },
                        C: {
                            singular: 'C_NAMESPACED_SINGULAR',
                            plural: 'C_NAMESPACED_PLURAL',
                            hint: 'C_NAMESPACED_HINT',
                        }
                    }
                }
            }
        }
    }
];

const model = new Model({
    types: [
        {
            kind: TypeKind.ROOT_ENTITY,
            name: 'A',
            fields: [{ name: 'field1', typeName: 'String' }, { name: 'field2', typeName: 'String' }, { name: 'field3', typeName: 'String' }]
        },
        {
            kind: TypeKind.ROOT_ENTITY,
            name: 'B',
            fields: [{ name: 'field1', typeName: 'String' }, { name: 'field2', typeName: 'String' }, { name: 'field3', typeName: 'String' }]
        },
        {
            kind: TypeKind.ROOT_ENTITY,
            name: 'C',
            namespacePath: ['namespace'],
            fields: [{ name: 'field1', typeName: 'String' }, { name: 'field2', typeName: 'String' }, { name: 'field3', typeName: 'String' }]
        }
    ],
    i18n
});

describe('I18n type localization', () => {
    it('provides localization for a fully translated type', () => {
      const localization = model.getRootEntityTypeOrThrow('A').getLocalization([FULLY]);
        expect(localization.singular).to.equal('A_FULLY_SINGULAR');
        expect(localization.plural).to.equal('A_FULLY_PLURAL');
        expect(localization.hint).to.equal('A_FULLY_HINT');
    });
    it('prefers languages in their given order', () => {
        const localization = model.getRootEntityTypeOrThrow('A').getLocalization([FULLY, PARTIALLY]);
        expect(localization.singular).to.equal('A_FULLY_SINGULAR');
        expect(localization.plural).to.equal('A_FULLY_PLURAL');
        expect(localization.hint).to.equal('A_FULLY_HINT');
    });
    it('provides partial localization for a partially translated type', () => {
        const localization = model.getRootEntityTypeOrThrow('A').getLocalization([PARTIALLY]);
        expect(localization.singular).to.equal('A_PARTIALLY_SINGULAR');
        expect(localization.plural).to.be.undefined;
        expect(localization.hint).to.be.undefined;
    });
    it('falls back to a less preferred language for missing localization property', () => {
        const localization = model.getRootEntityTypeOrThrow('A').getLocalization([PARTIALLY, FULLY]);
        expect(localization.singular).to.equal('A_PARTIALLY_SINGULAR');
        expect(localization.plural).to.equal('A_FULLY_PLURAL');
        expect(localization.hint).to.equal('A_FULLY_HINT');
    });
    it('falls back to a less preferred language for missing type localization', () => {
        const localization = model.getRootEntityTypeOrThrow('B').getLocalization([PARTIALLY, FULLY]);
        expect(localization.singular).to.equal('B_FULLY_SINGULAR');
        expect(localization.plural).to.equal('B_FULLY_PLURAL');
        expect(localization.hint).to.equal('B_FULLY_HINT');
    });
    it('finds localization within namespaces', () => {
        const localization = model.getRootEntityTypeOrThrow('C').getLocalization([NAMESPACED]);
        expect(localization.singular).to.equal('C_NAMESPACED_SINGULAR');
        expect(localization.plural).to.equal('C_NAMESPACED_PLURAL');
        expect(localization.hint).to.equal('C_NAMESPACED_HINT');
    });
    it('travels up namespaces to find more info', () => {
        const localization = model.getRootEntityTypeOrThrow('C').getLocalization([FULLY]);
        expect(localization.singular).to.equal('C_FULLY_SINGULAR');
        expect(localization.plural).to.equal('C_FULLY_PLURAL');
        expect(localization.hint).to.equal('C_FULLY_HINT');
    });
    it('never travels down namespaces to find more info', () => {
        const localization = model.getRootEntityTypeOrThrow('A').getLocalization([NAMESPACED]);
        expect(localization.singular).to.be.undefined;
        expect(localization.plural).to.be.undefined;
        expect(localization.hint).to.be.undefined;
    });
    it('prefers a super namespace over fallback language', () => {
        const localization = model.getRootEntityTypeOrThrow('C').getLocalization([FULLY, NAMESPACED]);
        expect(localization.singular).to.equal('C_FULLY_SINGULAR');
        expect(localization.plural).to.equal('C_FULLY_PLURAL');
        expect(localization.hint).to.equal('C_FULLY_HINT');
    });
});