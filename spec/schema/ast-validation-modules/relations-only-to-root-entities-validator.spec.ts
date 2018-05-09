import {ValidationResult} from "../../../src/schema/preparation/ast-validator";
import {parse} from "graphql";
import {
    RelationsOnlyToRootEntitiesValidator
} from "../../../src/schema/preparation/ast-validation-modules/relations-only-to-root-entities-validator";
import { expect } from 'chai';

const modelWithRelationToNonRoot = `
            type Stuff @childEntity {
                foo: String
            }
            type Bar @rootEntity {
                stuff: [Stuff] @relation
            }
        `;

const modelWithoutRelationToNonRoot = `
            type Stuff @rootEntity {
                foo: String
            }
            type Bar @rootEntity {
                stuff: [Stuff] @relation
            }
        `;

describe('relations only on root entities validator', () => {
    it('rejects @relation to non-@rootEntity', () => {
        const ast = parse(modelWithRelationToNonRoot);
        const validationResult = new ValidationResult(new RelationsOnlyToRootEntitiesValidator().validate(ast));
        expect(validationResult.hasErrors()).to.be.true;
        expect(validationResult.messages.length).to.equal(1);
        expect(validationResult.messages[0].message).to.equal('"Stuff" is not a root entity');
    });

    it('accepts @relation to @rootEntity', () => {
        const ast = parse(modelWithoutRelationToNonRoot);
        const validationResult = new ValidationResult(new RelationsOnlyToRootEntitiesValidator().validate(ast));
        expect(validationResult.hasErrors()).to.be.false;
    })

});
