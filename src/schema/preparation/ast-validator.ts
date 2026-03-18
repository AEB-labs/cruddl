import type { DocumentNode } from 'graphql';
import { Model } from '../../model/implementation/model.js';
import { ValidationMessage } from '../../model/validation/message.js';
import { ValidationResult } from '../../model/validation/result.js';
import type { ProjectSource } from '../../project/source.js';
import type { ParsedProjectSource } from '../parsing/parsed-project.js';
import { IndicesValidator } from './ast-validation-modules/indices-validator.js';
import { KeyFieldValidator } from './ast-validation-modules/key-field-validator.js';
import { NoListsOfListsValidator } from './ast-validation-modules/no-lists-of-lists-validator.js';
import { NoUnusedNonRootObjectTypesValidator } from './ast-validation-modules/no-unused-non-root-object-types-validator.js';
import { RolesOnNonRootEntityTypesValidator } from './ast-validation-modules/roles-on-non-root-entity-types.js';
import { GraphQLRulesValidator } from './source-validation-modules/graphql-rules.js';
import { PermissionProfileValidator } from './source-validation-modules/permission-profile-validator.js';
import { SidecarSchemaValidator } from './source-validation-modules/sidecar-schema.js';

const sourceValidators: ReadonlyArray<SourceValidator> = [];

const parsedProjectSourceValidators: ReadonlyArray<ParsedSourceValidator> = [
    new GraphQLRulesValidator(),
    new SidecarSchemaValidator(),
    new PermissionProfileValidator(),
];

const postMergeValidators: ReadonlyArray<ASTValidator> = [
    new KeyFieldValidator(),
    new NoUnusedNonRootObjectTypesValidator(),
    new NoListsOfListsValidator(),
    new RolesOnNonRootEntityTypesValidator(),
    new IndicesValidator(),
];

export interface ASTValidator {
    validate(ast: DocumentNode, model: Model): ReadonlyArray<ValidationMessage>;
}

export interface ParsedSourceValidator {
    validate(source: ParsedProjectSource): ReadonlyArray<ValidationMessage>;
}

export interface SourceValidator {
    validate(source: ProjectSource): ReadonlyArray<ValidationMessage>;
}

export function validateSource(source: ProjectSource): ValidationResult {
    return new ValidationResult(
        sourceValidators.flatMap((validator) => validator.validate(source)),
    );
}

export function validateParsedProjectSource(source: ParsedProjectSource): ValidationResult {
    return new ValidationResult(
        parsedProjectSourceValidators.flatMap((validator) => validator.validate(source)),
    );
}

export function validatePostMerge(ast: DocumentNode, model: Model): ValidationResult {
    return new ValidationResult(
        postMergeValidators.flatMap((validator) => {
            // All validators rely on a valid model except for the things they test.
            // That's why they allow them to throw errors due to a bad model.
            // To keep the validators simple, we just ignore these errors and
            // trust on the appropriate validator for the modelling mistake.
            try {
                return validator.validate(ast, model);
            } catch (e) {
                return [];
            }
        }),
    );
}
