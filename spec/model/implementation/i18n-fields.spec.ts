import { expect } from 'chai';
import { LocalizationConfig, Model, TypeKind } from '../../../src/model';

const FULLY = 'fully';
const PARTIALLY = 'partially';
const NAMESPACED = 'namespaced';

const i18n: LocalizationConfig[] = [
    {
        language: FULLY,
        namespacePath: [],
        types: {
            A: {
                fields: {
                    a1: { label: 'A1_FULLY_LABEL', hint: 'A1_FULLY_HINT' },
                    a2: { label: 'A2_FULLY_LABEL', hint: 'A2_FULLY_HINT' },
                },
            },
            // C is actually located in 'namespace' but translated in root here
            B: {
                fields: {
                    b1: { label: 'B1_FULLY_LABEL', hint: 'B1_FULLY_HINT' },
                    b2: { label: 'B2_FULLY_LABEL', hint: 'B2_FULLY_HINT' },
                },
            },
            C: {
                fields: {
                    c1: { label: 'C1_FULLY_LABEL', hint: 'C1_FULLY_HINT' },
                    c2: { label: 'C2_FULLY_LABEL', hint: 'C2_FULLY_HINT' },
                },
            },
        },
        fields: {
            g1: { label: 'G1_FULLY_LABEL', hint: 'G1_FULLY_HINT' },
        },
    },
    {
        language: PARTIALLY,
        namespacePath: [],
        types: {
            A: {
                fields: {
                    a1: { label: 'A1_PARTIALLY_LABEL' },
                    g2: { label: 'G2_PARTIALLY_LABEL_DIRECT' },
                },
            },
            B: {
                fields: {
                    b2: { label: 'B2_PARTIALLY_LABEL', hint: 'B2_PARTIALLY_HINT' },
                },
            },
        },
        fields: {
            g1: { hint: 'G1_PARTIALLY_HINT' },
            g2: { hint: 'G2_PARTIALLY_HINT' },
        },
    },
    {
        language: NAMESPACED,
        namespacePath: [],
        fields: {
            c1: { hint: 'C1_NON_NAMESPACED_HINT' },
        },
        types: {
            C: {
                fields: {
                    c2: { label: 'C2_NON_NAMESPACED_LABEL_DIRECT' },
                },
            },
        },
    },
    {
        language: NAMESPACED,
        namespacePath: ['namespace'],
        fields: {
            c2: { label: 'C2_NAMESPACED_LABEL' },
        },
        types: {
            C: {
                fields: {
                    c1: { label: 'C1_NAMESPACED_LABEL_DIRECT' },
                },
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
                { name: 'a1', typeName: 'String' },
                { name: 'a2', typeName: 'String' },
                { name: 'g1', typeName: 'String' },
                { name: 'g2', typeName: 'String' },
            ],
        },
        {
            kind: TypeKind.ROOT_ENTITY,
            name: 'B',
            fields: [
                { name: 'b1', typeName: 'String' },
                { name: 'b2', typeName: 'String' },
            ],
        },
        {
            kind: TypeKind.ROOT_ENTITY,
            name: 'C',
            namespacePath: ['namespace'],
            fields: [
                { name: 'c1', typeName: 'String' },
                { name: 'c2', typeName: 'String' },
            ],
        },
    ],
    i18n,
});

describe('I18n field localization', () => {
    it('provides localization for a fully translated type', () => {
        const localization = model
            .getRootEntityTypeOrThrow('A')
            .getFieldOrThrow('a1')
            .getLocalization([FULLY]);
        expect(localization.label).to.equal('A1_FULLY_LABEL');
        expect(localization.hint).to.equal('A1_FULLY_HINT');
    });

    it('prefers languages in their given order', () => {
        const localization = model
            .getRootEntityTypeOrThrow('A')
            .getFieldOrThrow('a1')
            .getLocalization([FULLY, PARTIALLY]);
        expect(localization.label).to.equal('A1_FULLY_LABEL');
        expect(localization.hint).to.equal('A1_FULLY_HINT');
    });

    it('provides partial localization for a partially translated type', () => {
        const localization = model
            .getRootEntityTypeOrThrow('A')
            .getFieldOrThrow('a1')
            .getLocalization([PARTIALLY]);
        expect(localization.label).to.equal('A1_PARTIALLY_LABEL');
        expect(localization.hint).to.be.undefined;
    });

    it('falls back to a less preferred language for missing localization property', () => {
        const localization = model
            .getRootEntityTypeOrThrow('A')
            .getFieldOrThrow('a1')
            .getLocalization([PARTIALLY, FULLY]);
        expect(localization.label).to.equal('A1_PARTIALLY_LABEL');
        expect(localization.hint).to.equal('A1_FULLY_HINT');
    });

    it('falls back to a less preferred language for missing field localization', () => {
        const localization = model
            .getRootEntityTypeOrThrow('B')
            .getFieldOrThrow('b1')
            .getLocalization([PARTIALLY, FULLY]);
        expect(localization.label).to.equal('B1_FULLY_LABEL');
        expect(localization.hint).to.equal('B1_FULLY_HINT');
    });

    it('falls back to a less preferred language for missing type localization', () => {
        const localization = model
            .getRootEntityTypeOrThrow('C')
            .getFieldOrThrow('c1')
            .getLocalization([PARTIALLY, FULLY]);
        expect(localization.label).to.equal('C1_FULLY_LABEL');
        expect(localization.hint).to.equal('C1_FULLY_HINT');
    });

    it('falls back to a common field translation missing localization properties', () => {
        const localization = model
            .getRootEntityTypeOrThrow('A')
            .getFieldOrThrow('g1')
            .getLocalization([PARTIALLY]);
        expect(localization.label).to.be.undefined;
        expect(localization.hint).to.equal('G1_PARTIALLY_HINT');
    });

    it('falls back to a common field translation missing localization type', () => {
        const localization = model
            .getRootEntityTypeOrThrow('A')
            .getFieldOrThrow('g1')
            .getLocalization([PARTIALLY]);
        expect(localization.label).to.be.undefined;
        expect(localization.hint).to.equal('G1_PARTIALLY_HINT');
    });

    it('falls back to a common field translation missing localization field', () => {
        const localization = model
            .getRootEntityTypeOrThrow('A')
            .getFieldOrThrow('g2')
            .getLocalization([PARTIALLY]);
        expect(localization.label).to.equal('G2_PARTIALLY_LABEL_DIRECT');
        expect(localization.hint).to.equal('G2_PARTIALLY_HINT');
    });

    it('falls back to a common field of a super namespace', () => {
        const localization = model
            .getRootEntityTypeOrThrow('C')
            .getFieldOrThrow('c1')
            .getLocalization([NAMESPACED]);
        expect(localization.label).to.equal('C1_NAMESPACED_LABEL_DIRECT');
        expect(localization.hint).to.equal('C1_NON_NAMESPACED_HINT');
    });

    it('prefers a type-field of a super namespace over a common field in the direct namespace', () => {
        const localization = model
            .getRootEntityTypeOrThrow('C')
            .getFieldOrThrow('c2')
            .getLocalization([NAMESPACED]);
        expect(localization.label).to.equal('C2_NON_NAMESPACED_LABEL_DIRECT');
    });
});
