import { expect } from 'chai';
import { assertValidatorAcceptsAndDoesNotWarn, assertValidatorRejects, validate } from './helpers';

describe('known object type directive validator', () => {
    it('rejects unknown object type directives', () => {
        const validationResult = validate(`
            type Stuff @invalid @rootEntity {
                foo: String
            }
        `);
        expect(validationResult.hasErrors()).to.be.true;
        expect(validationResult.messages.length, validationResult.toString()).to.equal(1);
        expect(validationResult.messages[0].message).to.equal('Unknown directive "@invalid".');
    });

    it('accepts known object type directives', () => {
        assertValidatorAcceptsAndDoesNotWarn(`
            type Stuff @rootEntity {
                foo: String
            }
        `);
    });

    it('rejects object types without directives', () => {
        assertValidatorRejects(
            `
            type Stuff {
                foo: String
            }
        `,
            'Add one of @rootEntity, @childEntity, @entityExtension or @valueObject.',
        );
    });
});
