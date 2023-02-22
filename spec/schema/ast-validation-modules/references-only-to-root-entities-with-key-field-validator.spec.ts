import { assertValidatorAcceptsAndDoesNotWarn, assertValidatorRejects } from './helpers';

const modelWithReferenceToNonRoot = `
            type Stuff @childEntity {
                foo: String
            }
            type Bar @rootEntity {
                stuff: [Stuff] @reference
            }
        `;

const modelWithReferenceToRootWithoutKeyField = `
            type Stuff @rootEntity {
                foo: String
            }
            type Bar @rootEntity {
                stuff: Stuff @reference
            }
        `;

const modelWithoutReferenceToNonRoot = `
            type Stuff @rootEntity {
                foo: String @key
            }
            type Bar @rootEntity {
                stuff: Stuff @reference(keyField: "stuffKey")
                stuffKey: String
            }
        `;

describe('references only on root entity with key field validator', () => {
    it('rejects @reference to non-@rootEntity', () => {
        assertValidatorRejects(
            modelWithReferenceToNonRoot,
            '"Stuff" cannot be used as @reference type because is not a root entity type.',
        );
    });

    it('rejects @reference to rootEntity without @key', () => {
        assertValidatorRejects(
            modelWithReferenceToRootWithoutKeyField,
            '"Stuff" cannot be used as @reference type because it does not have a field annotated with @key.',
        );
    });

    it('accepts @reference to @rootEntity with @key', () => {
        assertValidatorAcceptsAndDoesNotWarn(modelWithoutReferenceToNonRoot);
    });
});
