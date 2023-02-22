import { expect } from 'chai';
import { assertValidatorAcceptsAndDoesNotWarn, assertValidatorRejects, validate } from './helpers';

const modelWithTypeWithoutDirective = `
            type Stuff {
                foo: String
            }
        `;

const modelWithTypeWithToManyDirectives = `
            type Stuff @rootEntity @valueObject {
                foo: String
            }
        `;

const modelWithoutDirectiveFlaws = `
            enum Bla {
                ONE
                TWO
            }

            type Stuff @rootEntity {
                foo: String
                children: [Child]
                ext: Extension
                value: Value 
            }
            type Child @childEntity {
                name: String
            }
            
            type Value @valueObject {
                number: Int    
            }
            
            type Extension @entityExtension {
                number2: Int
            }
        `;

describe('object directive count validator', () => {
    it('finds types without directive', () => {
        assertValidatorRejects(
            modelWithTypeWithoutDirective,
            'Add one of @rootEntity, @childEntity, @entityExtension or @valueObject.',
        );
    });

    it('finds types with too many directive', () => {
        const validationResult = validate(modelWithTypeWithToManyDirectives);
        expect(validationResult.getErrors().length, validationResult.toString()).to.equal(2);
        expect(validationResult.getErrors()[0].message).to.equal(
            'Only one of @rootEntity, @childEntity, @entityExtension or @valueObject can be used.',
        );
        expect(validationResult.getErrors()[1].message).to.equal(
            'Only one of @rootEntity, @childEntity, @entityExtension or @valueObject can be used.',
        );
    });

    it('accepts correct type directives', () => {
        assertValidatorAcceptsAndDoesNotWarn(modelWithoutDirectiveFlaws);
    });
});
