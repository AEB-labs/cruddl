import {ValidationResult} from "../../../src/schema/preparation/ast-validator";
import {parse} from "graphql";
import {
    CheckDirectedRelationEdgesValidator,
    VALIDATION_ERROR_INVALID_ARGUMENT_TYPE,
    VALIDATION_ERROR_INVERSE_FIELD_NOT_FOUND,
    VALIDATION_WARNING_UNASSOCIATED_RELATIONS
} from "../../../src/schema/preparation/ast-validation-modules/check-directed-relation-edges-validator";

describe('check-directed-relation-edges-validator', () => {

    assertValidatorAccepts('forward only @relation', `
        type Foo @rootEntity { bar: Bar @relation }
        type Bar @rootEntity { bla: String }
    `);

    assertValidatorAccepts('bidirectional relation @relation', `
        type Foo @rootEntity { bar: Bar @relation }
        type Bar @rootEntity { foo: Foo @relation(inverseOf: "bar") }
    `);

    assertValidatorAccepts('two forward only @relations', `
        type Foo @rootEntity { bar: Bar @relation, bar2: Bar @relation }
        type Bar @rootEntity { bla: String }
    `);

    assertValidatorAccepts('two bidirectional @relations', `
        type Foo @rootEntity { bar: Bar @relation, bar2: Bar @relation }
        type Bar @rootEntity { foo: Foo @relation(inverseOf:"bar"), foo2: Foo @relation(inverseOf:"bar2") }
    `);

    assertValidatorAccepts('one bidirectional and one forward only @relation', `
        type Foo @rootEntity { bar: Bar @relation, bar2: Bar @relation }
        type Bar @rootEntity { foo: Foo @relation(inverseOf:"bar") }
    `);

    assertValidatorRejects('backward only @relations', `
        type Foo @rootEntity { bar: Bar @relation(inverseOf: "foo") }
        type Bar @rootEntity { bla: String }
    `, VALIDATION_ERROR_INVERSE_FIELD_NOT_FOUND);

    assertValidatorWarns('screwed @relations', `
        type Foo @rootEntity { bar: Bar @relation }
        type Bar @rootEntity { foo: Foo @relation }
    `, VALIDATION_WARNING_UNASSOCIATED_RELATIONS);

    assertValidatorRejects('inverseOf with bad type', `
        type Foo @rootEntity { bar: Bar @relation }
        type Bar @rootEntity { foo: Foo @relation(inverseOf:5) }
    `, VALIDATION_ERROR_INVALID_ARGUMENT_TYPE);

    assertValidatorRejects('@relation with bad remote type', `
        type Foo @rootEntity { bar: Bar @relation }
        type Bar @rootEntity { foo: XXX @relation(inverseOf:bar) }
    `, VALIDATION_ERROR_INVALID_ARGUMENT_TYPE);

});

function assertValidatorRejects(expectation: string, model: string, msg: string) {
    it('rejects ' + expectation, () => {
        const ast = parse(model);
        const validationResult = new ValidationResult(new CheckDirectedRelationEdgesValidator().validate(ast));
        expect(validationResult.hasErrors()).toBeTruthy();
        expect(validationResult.messages.length).toBe(1);
        expect(validationResult.messages[0].message).toBe(msg);
    });
}

function assertValidatorWarns(expectation: string, model: string, msg: string) {
    it('warns ' + expectation, () => {
        const ast = parse(model);
        const validationResult = new ValidationResult(new CheckDirectedRelationEdgesValidator().validate(ast));
        expect(validationResult.hasWarnings()).toBeTruthy();
        expect(validationResult.messages.find(validatedMsg => validatedMsg.message === msg)).toBeDefined()
    });
}

function assertValidatorAccepts(expectation: string, model: string) {
    it('accepts ' + expectation, () => {
        const ast = parse(model);
        const validationResult = new ValidationResult(new CheckDirectedRelationEdgesValidator().validate(ast));
        expect(validationResult.hasErrors()).toBeFalsy();
    });
}
