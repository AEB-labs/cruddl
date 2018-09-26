import { DocumentNode } from 'graphql';
import { Model, ValidationMessage, ValidationResult } from '../../model';
import { ProjectSource } from '../../project/source';
import { flatMap } from '../../utils/utils';
import { IndicesValidator } from './ast-validation-modules/indices-validator';
import { KeyFieldValidator } from './ast-validation-modules/key-field-validator';
import { NoListsOfListsValidator } from './ast-validation-modules/no-lists-of-lists-validator';
import { NoUnusedNonRootObjectTypesValidator } from './ast-validation-modules/no-unused-non-root-object-types-validator';
import { RolesOnNonRootEntityTypesValidator } from './ast-validation-modules/roles-on-non-root-entity-types';
import { GraphQLRulesValidator } from './source-validation-modules/graphql-rules';
import { SidecarSchemaValidator } from './source-validation-modules/sidecar-schema';
import { ParsedProjectSource } from '../../config/parsed-project';

const sourceValidators: ReadonlyArray<SourceValidator>  = [];

const parsedProjectSourceValidators: ReadonlyArray<ParsedSourceValidator>  = [
    new GraphQLRulesValidator(),
    new SidecarSchemaValidator()
];

const postMergeValidators: ReadonlyArray<ASTValidator> = [
    new KeyFieldValidator(),
    new NoUnusedNonRootObjectTypesValidator(),
    new NoListsOfListsValidator(),
    new RolesOnNonRootEntityTypesValidator(),
    new IndicesValidator()
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
    return new ValidationResult(flatMap(sourceValidators, validator => validator.validate(source)));
}

export function validateParsedProjectSource(source: ParsedProjectSource): ValidationResult {
    return new ValidationResult(flatMap(parsedProjectSourceValidators, validator => validator.validate(source)));
}

export function validatePostMerge(ast: DocumentNode, model: Model): ValidationResult {
    return new ValidationResult(flatMap(postMergeValidators, validator => {
        // All validators rely on a valid model except for the things they test.
        // That's why they allow them to throw errors due to a bad model.
        // To keep the validators simple, we just ignore these errors and
        // trust on the appropriate validator for the modelling mistake.
        try {
            return validator.validate(ast, model)
        } catch(e) {
            return []
        }
    }));
}
