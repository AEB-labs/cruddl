import { DocumentNode } from 'graphql';
import { ValidationMessage, ValidationResult } from '../../model/validation';
import { flatMap } from '../../utils/utils';
import { KeyFieldValidator } from './ast-validation-modules/key-field-validator';
import { NoUnusedNonRootObjectTypesValidator } from './ast-validation-modules/no-unused-non-root-object-types-validator';
import { NoListsOfListsValidator } from './ast-validation-modules/no-lists-of-lists-validator';
import { RolesOnNonRootEntityTypesValidator } from './ast-validation-modules/roles-on-non-root-entity-types';
import { IndicesValidator } from './ast-validation-modules/indices-validator';
import { ProjectSource } from '../../project/source';
import { CheckGraphQLSyntaxValidator } from './source-validation-modules/check-graphql-syntax';
import { GraphQLRulesValidator } from './source-validation-modules/graphql-rules';
import { CheckYamlSyntaxValidator } from './source-validation-modules/check-yaml-syntax';
import { CheckJsonSyntaxValidator } from './source-validation-modules/check-json-syntax';
import { PermissionProfileMap } from '../../authorization/permission-profile';
import { Model } from '../../model';
import { SidecarSchemaValidator } from './source-validation-modules/sidecar-schema';

const sourceValidators: SourceValidator[]  = [
    new CheckGraphQLSyntaxValidator(),
    new GraphQLRulesValidator(),
    new CheckYamlSyntaxValidator(),
    new CheckJsonSyntaxValidator(),
    new SidecarSchemaValidator(),
];

const postMergeValidators: ASTValidator[] = [
    new KeyFieldValidator(),
    new NoUnusedNonRootObjectTypesValidator(),
    new NoListsOfListsValidator(),
    new RolesOnNonRootEntityTypesValidator(),
    new IndicesValidator()
];

export interface ASTValidator {
    validate(ast: DocumentNode, context: ASTValidationContext, model: Model): ValidationMessage[];
}

export interface SourceValidator {
    validate(source: ProjectSource): ValidationMessage[];
}

export function validateSource(source: ProjectSource): ValidationResult {
    return new ValidationResult(flatMap(sourceValidators, validator => validator.validate(source)));
}

export function validatePostMerge(ast: DocumentNode, context: ASTValidationContext, model: Model): ValidationResult {
    return new ValidationResult(flatMap(postMergeValidators, validator => {
        // All validators rely on a valid model except for the things they test.
        // That's why they allow them to throw errors due to a bad model.
        // To keep the validators simple, we just ignore these errors and
        // trust on the appropriate validator for the modelling mistake.
        try {
            return validator.validate(ast, context, model)
        } catch(e) {
            return []
        }
    }));
}

export interface ASTValidationContext {
    defaultNamespace?: string
    permissionProfiles?: PermissionProfileMap
}
