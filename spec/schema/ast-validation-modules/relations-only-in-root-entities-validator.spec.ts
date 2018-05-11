import {ValidationResult} from "../../../src/model/validation/result";
import {parse} from "graphql";
import {
    RelationsOnlyInRootEntitiesValidator,
    VALIDATION_ERROR_RELATION_IN_NON_ROOT_ENTITY
} from "../../../src/schema/preparation/ast-validation-modules/relations-only-in-root-entities-validator";
import { expect } from 'chai';

const modelWithRelationInNonRoot = `
            type Stuff @rootEntity {
                foo: String
            }
            type Bar @childEntity {
                stuff: [Stuff] @relation
            }
        `;

const modelWithoutRelationInNonRoot = `
            type Stuff @rootEntity {
                foo: String
            }
            type Bar @rootEntity {
                stuff: [Stuff] @relation
            }
        `;

describe('relations only in root entities validator', () => {
    it('rejects @relation in non-@rootEntity', () => {
        const ast = parse(modelWithRelationInNonRoot);
        const validationResult = new ValidationResult(new RelationsOnlyInRootEntitiesValidator().validate(ast));
        expect(validationResult.hasErrors()).to.be.true;
        expect(validationResult.messages.length).to.equal(1);
        expect(validationResult.messages[0].message).to.equal(VALIDATION_ERROR_RELATION_IN_NON_ROOT_ENTITY);
    });

    it('accepts @relation in @rootEntity', () => {
        const ast = parse(modelWithoutRelationInNonRoot);
        const validationResult = new ValidationResult(new RelationsOnlyInRootEntitiesValidator().validate(ast));
        expect(validationResult.hasErrors()).to.be.false;
    })

});
