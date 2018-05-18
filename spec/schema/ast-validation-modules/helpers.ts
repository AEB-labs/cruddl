import { createModel, PermissionProfileConfigMap } from '../../../src/model';
import { ValidationResult } from '../../../src/model/validation';
import { parse, Source } from 'graphql';
import { expect } from 'chai';
import { validatePostMerge, validateSource } from '../../../src/schema/preparation/ast-validator';
import { ProjectSource } from '../../../src/project/source';

export function assertValidatorRejects(source: string, msg: string) {
    const validationResult = validate(source);
    expect(validationResult.hasErrors()).to.be.true;
    expect(validationResult.getErrors().length, validationResult.toString()).to.equal(1);
    expect(validationResult.getErrors()[0].message, validationResult.toString()).to.equal(msg);
}

export function assertValidatorWarns(source: string, msg: string) {
    const validationResult = validate(source);
    expect(validationResult.hasWarnings()).to.be.true;
    expect(validationResult.messages.find(validatedMsg => validatedMsg.message === msg), validationResult.toString()).to.not.be.undefined;
}

export function assertValidatorAccepts(source: string) {
    const validationResult = validate(source);
    expect(validationResult.hasErrors(), validationResult.toString()).to.be.false;
}

export function assertValidatorAcceptsAndDoesNotWarn(source: string) {
    const validationResult = validate(source);
    expect(validationResult.hasErrors(), validationResult.toString()).to.be.false;
    expect(validationResult.hasWarnings(), validationResult.toString()).to.be.false;
}

export function validate(source: string, options: { permissionProfiles?: PermissionProfileConfigMap } = {}): ValidationResult {
    const ast = parse(new Source(source, 'schema.graphqls'));
    const model = createModel({
        schemaParts: [{document: ast}],
        permissionProfiles: options.permissionProfiles || {
            default: {
                permissions: [
                    {
                        roles: ['admin'],
                        access: 'readWrite'
                    }
                ]
            }
        }
    });
    const astResults = validatePostMerge(ast, {}, model);
    const sourceResults = validateSource(new ProjectSource('schema.graphqls', source));
    return new ValidationResult([
        ...model.validate().messages,
        ...sourceResults.messages,
        ...astResults.messages
    ]);
}
