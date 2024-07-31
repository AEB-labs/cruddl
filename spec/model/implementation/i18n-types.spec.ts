import { expect } from 'chai';
import { LocalizationConfig, Model, TypeKind } from '../../../src/model';

const FULLY = 'fully';
const PARTIALLY = 'partially';
const NAMESPACED = 'namespaced';

const i18n: ReadonlyArray<LocalizationConfig> = [
    {
        language: FULLY,
        namespacePath: [],
        types: {
            A: {
                label: 'A_FULLY_LABEL',
                labelPlural: 'A_FULLY_LABEL_PLURAL',
                hint: 'A_FULLY_HINT',
            },
            B: {
                label: 'B_FULLY_LABEL',
                labelPlural: 'B_FULLY_LABEL_PLURAL',
                hint: 'B_FULLY_HINT',
            },
            // C is actually located in 'namespace' but translated in root here
            C: {
                label: 'C_FULLY_LABEL',
                labelPlural: 'C_FULLY_LABEL_PLURAL',
                hint: 'C_FULLY_HINT',
            },
        },
    },
    {
        language: PARTIALLY,
        namespacePath: [],
        types: {
            A: {
                label: 'A_PARTIALLY_LABEL',
            },
            // B missing
            // C is actually located in 'namespace' but translated in root here
            C: {
                label: 'C_PARTIALLY_LABEL',
            },
        },
    },
    {
        language: NAMESPACED,
        namespacePath: ['namespace'],
        types: {
            // A is not namespaced in model, this localization must never be used
            A: {
                label: 'A_NAMESPACED_LABEL',
                labelPlural: 'A_NAMESPACED_LABEL_PLURAL',
                hint: 'A_NAMESPACED_HINT',
            },
            C: {
                label: 'C_NAMESPACED_LABEL',
                labelPlural: 'C_NAMESPACED_LABEL_PLURAL',
                hint: 'C_NAMESPACED_HINT',
            },
        },
    },
];

const model = new Model({
    types: [
        {
            kind: TypeKind.ROOT_ENTITY,
            name: 'A',
            fields: [
                { name: 'field1', typeName: 'String' },
                { name: 'field2', typeName: 'String' },
                { name: 'field3', typeName: 'String' },
            ],
        },
        {
            kind: TypeKind.ROOT_ENTITY,
            name: 'B',
            fields: [
                { name: 'field1', typeName: 'String' },
                { name: 'field2', typeName: 'String' },
                { name: 'field3', typeName: 'String' },
            ],
        },
        {
            kind: TypeKind.ROOT_ENTITY,
            name: 'C',
            namespacePath: ['namespace'],
            fields: [
                { name: 'field1', typeName: 'String' },
                { name: 'field2', typeName: 'String' },
                { name: 'field3', typeName: 'String' },
            ],
        },
    ],
    i18n,
});

describe('I18n type localization', () => {
    it('provides localization for a fully translated type', () => {
        const localization = model.getRootEntityTypeOrThrow('A').getLocalization([FULLY]);
        expect(localization.label).to.equal('A_FULLY_LABEL');
        expect(localization.labelPlural).to.equal('A_FULLY_LABEL_PLURAL');
        expect(localization.hint).to.equal('A_FULLY_HINT');
    });
    it('prefers languages in their given order', () => {
        const localization = model
            .getRootEntityTypeOrThrow('A')
            .getLocalization([FULLY, PARTIALLY]);
        expect(localization.label).to.equal('A_FULLY_LABEL');
        expect(localization.labelPlural).to.equal('A_FULLY_LABEL_PLURAL');
        expect(localization.hint).to.equal('A_FULLY_HINT');
    });
    it('provides partial localization for a partially translated type', () => {
        const localization = model.getRootEntityTypeOrThrow('A').getLocalization([PARTIALLY]);
        expect(localization.label).to.equal('A_PARTIALLY_LABEL');
        expect(localization.labelPlural).to.be.undefined;
        expect(localization.hint).to.be.undefined;
    });
    it('falls back to a less preferred language for missing localization property', () => {
        const localization = model
            .getRootEntityTypeOrThrow('A')
            .getLocalization([PARTIALLY, FULLY]);
        expect(localization.label).to.equal('A_PARTIALLY_LABEL');
        expect(localization.labelPlural).to.equal('A_FULLY_LABEL_PLURAL');
        expect(localization.hint).to.equal('A_FULLY_HINT');
    });
    it('falls back to a less preferred language for missing type localization', () => {
        const localization = model
            .getRootEntityTypeOrThrow('B')
            .getLocalization([PARTIALLY, FULLY]);
        expect(localization.label).to.equal('B_FULLY_LABEL');
        expect(localization.labelPlural).to.equal('B_FULLY_LABEL_PLURAL');
        expect(localization.hint).to.equal('B_FULLY_HINT');
    });
    it('finds localization within namespaces', () => {
        const localization = model.getRootEntityTypeOrThrow('C').getLocalization([NAMESPACED]);
        expect(localization.label).to.equal('C_NAMESPACED_LABEL');
        expect(localization.labelPlural).to.equal('C_NAMESPACED_LABEL_PLURAL');
        expect(localization.hint).to.equal('C_NAMESPACED_HINT');
    });
    it('travels up namespaces to find more info', () => {
        const localization = model.getRootEntityTypeOrThrow('C').getLocalization([FULLY]);
        expect(localization.label).to.equal('C_FULLY_LABEL');
        expect(localization.labelPlural).to.equal('C_FULLY_LABEL_PLURAL');
        expect(localization.hint).to.equal('C_FULLY_HINT');
    });
    it('never travels down namespaces to find more info', () => {
        const localization = model.getRootEntityTypeOrThrow('A').getLocalization([NAMESPACED]);
        expect(localization.label).to.be.undefined;
        expect(localization.labelPlural).to.be.undefined;
        expect(localization.hint).to.be.undefined;
    });
    it('prefers a super namespace over fallback language', () => {
        const localization = model
            .getRootEntityTypeOrThrow('C')
            .getLocalization([FULLY, NAMESPACED]);
        expect(localization.label).to.equal('C_FULLY_LABEL');
        expect(localization.labelPlural).to.equal('C_FULLY_LABEL_PLURAL');
        expect(localization.hint).to.equal('C_FULLY_HINT');
    });
});
