
import {ValidationResult} from "../../../src/schema/preparation/ast-validator";
import {
    EntityDirectiveNestingValidator, VALIDATION_ERROR_ENTITY_IN_VALUE_OBJECT_NOT_ALLOWED,
    VALIDATION_ERROR_ROOT_ENTITY_NOT_EMBEDDABLE, VALIDATION_ERROR_EMBEDDED_CHILD_ENTITY_WITHOUT_LIST
} from "../../../src/schema/preparation/ast-validation-modules/entity-directive-nesting-validator";
import {parse} from "graphql";
import { expect } from 'chai';

describe('entity directive nesting validator', () => {

    assertValidatorAccepts('field of @rootEntity type as @relation', `
        type Foo @rootEntity { fooo: String }
        type Bar @rootEntity { foo: Foo @relation }
    `);

    assertValidatorAccepts('field of @rootEntity type as @reference', `
        type Foo @rootEntity { fooo: String } 
        type Bar @rootEntity { foo: Foo @reference }
    `);

    assertValidatorAccepts('list of @rootEntity type as @relation', `
        type Foo @rootEntity { fooo: String }
        type Bar @rootEntity { foo: [Foo] @relation }
    `);

    assertValidatorRejects('field of @rootEntity type without @relation or @reference', `
        type Foo @rootEntity { fooo: String }      
        type Bar @rootEntity { foo: Foo }
    `, VALIDATION_ERROR_ROOT_ENTITY_NOT_EMBEDDABLE);

    assertValidatorRejects('list of @rootEntity type without @relation or @reference', `
        type Foo @rootEntity { fooo: String }
        type Bar @rootEntity { foo: [Foo] }
    `, VALIDATION_ERROR_ROOT_ENTITY_NOT_EMBEDDABLE);

    assertValidatorRejects('non nullable list of @rootEntity type without @relation or @reference', `
        type Foo @rootEntity { fooo: String }
        type Bar @rootEntity { foo: [Foo!]! }
    `, VALIDATION_ERROR_ROOT_ENTITY_NOT_EMBEDDABLE);

    assertValidatorAccepts('nesting @valueObjects', `
        type Foo @valueObject { fooo: String }
        type Bar @valueObject { foo: Foo }
    `);

    assertValidatorAccepts('nesting @valueObject lists', `
        type Foo @valueObject { fooo: String }
        type Bar @valueObject { foo: [Foo] }
    `);

    assertValidatorAccepts('nesting non-nullable @valueObject lists', `
        type Foo @valueObject { fooo: String }
        type Bar @valueObject { foo: [Foo!]! }
    `);

    assertValidatorRejects('nesting an entity into @valueObjects', `
        type Foo @childEntity { fooo: String }
        type Bar @valueObject { foo: Foo }
    `, VALIDATION_ERROR_ENTITY_IN_VALUE_OBJECT_NOT_ALLOWED);

    assertValidatorRejects('nesting an entity list into @valueObjects', `
        type Foo @childEntity { fooo: String }
        type Bar @valueObject { foo: [Foo] }
    `, VALIDATION_ERROR_ENTITY_IN_VALUE_OBJECT_NOT_ALLOWED);

    assertValidatorRejects('nesting an non-null entity list into @valueObjects', `
        type Foo @childEntity { fooo: String }
        type Bar @valueObject { foo: [Foo!]! }
    `, VALIDATION_ERROR_ENTITY_IN_VALUE_OBJECT_NOT_ALLOWED);

    assertValidatorAccepts('valueObjects with reference to @rootEntity', `
        type Foo @rootEntity { fooo: String }
        type Bar @valueObject { foo: Foo @reference }
    `);

    assertValidatorAccepts('valueObjects with list of reference to @rootEntity', `
        type Foo @rootEntity { fooo: String }
        type Bar @valueObject { foo: [Foo] @reference }
    `);

    assertValidatorAccepts('valueObjects with non-nullable list of reference to @rootEntity', `
        type Foo @rootEntity { fooo: String }
        type Bar @valueObject { foo: [Foo!]! @reference }
    `);

    assertValidatorRejects('@childEntity field usage without list', `
        type Foo @childEntity { fooo: String }
        type Bar @rootEntity { foo: Foo }
    `, VALIDATION_ERROR_EMBEDDED_CHILD_ENTITY_WITHOUT_LIST);

});

function assertValidatorRejects(expectation: string, model: string, msg: string) {
    it('rejects ' + expectation, () => {
        const ast = parse(model);
        const validationResult = new ValidationResult(new EntityDirectiveNestingValidator().validate(ast));
        expect(validationResult.hasErrors()).to.be.true;
        expect(validationResult.messages.length).to.not.be.undefined;
        expect(validationResult.messages[0].message).to.equal(msg);
    });
}

function assertValidatorWarns(expectation: string, model: string, msg: string) {
    it('warns ' + expectation, () => {
        const ast = parse(model);
        const validationResult = new ValidationResult(new EntityDirectiveNestingValidator().validate(ast));
        expect(validationResult.hasWarnings()).to.be.true;
        expect(validationResult.messages.length).to.equal(1);
        expect(validationResult.messages[0].message).to.equal(msg);
    });
}

function assertValidatorAccepts(expectation: string, model: string) {
    it('accepts ' + expectation, () => {
        const ast = parse(model);
        const validationResult = new ValidationResult(new EntityDirectiveNestingValidator().validate(ast));
        expect(validationResult.hasErrors()).to.be.false;
    });
}
