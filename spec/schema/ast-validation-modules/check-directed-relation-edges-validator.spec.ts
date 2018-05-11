import { ValidationResult } from '../../../src/model/validation/result';
import { parse } from 'graphql';
import {
    CheckDirectedRelationEdgesValidator,
    VALIDATION_ERROR_INVALID_ARGUMENT_TYPE
} from '../../../src/schema/preparation/ast-validation-modules/check-directed-relation-edges-validator';
import { expect } from 'chai';

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
    `, 'Type "Bar" does not have a field "foo"');

    assertValidatorWarns('screwed @relations', `
        type Foo @rootEntity { bar: Bar @relation }
        type Bar @rootEntity { foo: Foo @relation }
    `, 'This field and "Bar.foo" define separate relations. Consider using the "inverseOf" argument to add a backlink to an existing relation');

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
        expect(validationResult.hasErrors()).to.be.true;
        expect(validationResult.messages.length).to.equal(1);
        expect(validationResult.messages[0].message).to.equal(msg);
    });
}

function assertValidatorWarns(expectation: string, model: string, msg: string) {
    it('warns ' + expectation, () => {
        const ast = parse(model);
        const validationResult = new ValidationResult(new CheckDirectedRelationEdgesValidator().validate(ast));
        expect(validationResult.hasWarnings()).to.be.true;
        expect(validationResult.messages.find(validatedMsg => validatedMsg.message === msg)).to.not.be.undefined;
    });
}

function assertValidatorAccepts(expectation: string, model: string) {
    it('accepts ' + expectation, () => {
        const ast = parse(model);
        const validationResult = new ValidationResult(new CheckDirectedRelationEdgesValidator().validate(ast));
        expect(validationResult.hasErrors()).to.be.false;
    });
}
