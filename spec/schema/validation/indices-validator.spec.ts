import {CheckDirectedRelationEdgesValidator} from "../../../src/schema/preparation/ast-validation-modules/check-directed-relation-edges-validator";
import {parse} from "graphql";
import {ValidationResult} from "../../../src/schema/preparation/ast-validator";
import {
    IndicesValidator,
    VALIDATION_ERROR_INDICES_INVALID_FIELDS_ARGUMENT, VALIDATION_ERROR_INDICES_INVALID_PATH_BAD_SYNTAX,
    VALIDATION_ERROR_INDICES_INVALID_PATH_FINAL_NODE_HAS_NO_SUBFIELDS,
    VALIDATION_ERROR_INDICES_INVALID_PATH_INVALID_INTERMEDIATE_NODE,
    VALIDATION_ERROR_INDICES_INVALID_PATH_NON_SCALAR_END,
    VALIDATION_ERROR_INDICES_MISSING_FIELDS, VALIDATION_ERROR_INDICES_UNKNOWN_FIELD_ON_PATH
} from "../../../src/schema/preparation/ast-validation-modules/indices-validator";

describe('indices validator', () => {

    assertValidatorAccepts('flawless index', `
        type Foo @rootEntity(indices:[{ fields: ["foo" ]}]) { foo: String }
    `);

    assertValidatorAccepts('index on enum type', `
        enum Animal { Cat, Dog }
        type Foo @rootEntity(indices:[{ fields: ["animal" ]}]) { animal: Animal }
    `);

    assertValidatorAccepts('index on multiple columns', `
        type Foo @rootEntity(indices:[{ fields: ["foo", "bar" ]}]) { foo: String, bar: String }
    `);

    assertValidatorAccepts('index on nested field', `
        type Foo @rootEntity(indices:[{ fields: ["bar.baz" ]}]) { foo: String, bar: Bar }
        type Bar @entityExtension { baz: String }
    `);

    assertValidatorRejects('index without fields', `
        type Foo @rootEntity(indices:[{}]) { foo: String }
    `, VALIDATION_ERROR_INDICES_MISSING_FIELDS);

    assertValidatorRejects('index with empty fields list', `
        type Foo @rootEntity(indices:[{ fields: []}]) { foo: String }
    `, VALIDATION_ERROR_INDICES_INVALID_FIELDS_ARGUMENT);

    assertValidatorRejects('index with bad fields syntax', `
        type Foo @rootEntity(indices:[{ fields: ["asds#/asd"]}]) { foo: String }
    `, VALIDATION_ERROR_INDICES_INVALID_PATH_BAD_SYNTAX);

    assertValidatorRejects('index with unknown field in path', `
        type Foo @rootEntity(indices:[{ fields: ["bar"]}]) { foo: String }
    `, VALIDATION_ERROR_INDICES_UNKNOWN_FIELD_ON_PATH);

    assertValidatorRejects('index with unknown field in path', `
        type Foo @rootEntity(indices:[{ fields: ["bar"]}]) { foo: String }
    `, VALIDATION_ERROR_INDICES_UNKNOWN_FIELD_ON_PATH);

    assertValidatorRejects('index on missing nested field', `
        type Foo @rootEntity(indices:[{ fields: ["bar.bla"]}]) { foo: String, bar: Bar }
        type Bar @entityExtension { baz: String }
    `, VALIDATION_ERROR_INDICES_UNKNOWN_FIELD_ON_PATH);

    assertValidatorRejects('index on non-scalar field', `
        type Foo @rootEntity(indices:[{ fields: ["bar"]}]) { foo: String, bar: Bar }
        type Bar @entityExtension { baz: String }
    `, VALIDATION_ERROR_INDICES_INVALID_PATH_NON_SCALAR_END);

    assertValidatorRejects('index with sub-path in scalar', `
        type Foo @rootEntity(indices:[{ fields: ["bar.baz"]}]) { foo: String, bar: String }
    `, VALIDATION_ERROR_INDICES_INVALID_PATH_FINAL_NODE_HAS_NO_SUBFIELDS);

    assertValidatorRejects('index on relation', `
        type Foo @rootEntity(indices:[{ fields: ["bar.baz"]}]) { bar: Bar @relation }
        type Bar @rootEntity { baz: String }
    `, VALIDATION_ERROR_INDICES_INVALID_PATH_INVALID_INTERMEDIATE_NODE);

});



function assertValidatorRejects(expectation: string, model: string, msg: string) {
    it('rejects ' + expectation, () => {
        const ast = parse(model);
        const validationResult = new ValidationResult(new IndicesValidator().validate(ast));
        expect(validationResult.hasErrors()).toBeTruthy();
        expect(validationResult.messages.length).toBe(1);
        expect(validationResult.messages[0].msgKey).toBe(msg);
    });
}

function assertValidatorAccepts(expectation: string, model: string) {
    it('accepts ' + expectation, () => {
        const ast = parse(model);
        const validationResult = new ValidationResult(new IndicesValidator().validate(ast));
        expect(validationResult.hasErrors()).toBeFalsy();
    });
}
