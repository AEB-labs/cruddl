import { DocumentNode, Source } from 'graphql';
import {Severity, ValidationMessage} from "./validation-message";
import {flatMap} from "../../utils/utils";
import {NoDuplicateTypesValidator} from "./ast-validation-modules/no-duplicate-types-validator";
import {OnlyAllowedTypesValidator} from "./ast-validation-modules/only-allowed-types-validator";
import {KeyFieldValidator} from "./ast-validation-modules/key-field-validator";
import {EntityDirectiveNestingValidator} from "./ast-validation-modules/entity-directive-nesting-validator";
import {NoListOfReferencesValidator} from "./ast-validation-modules/no-list-of-references-validator";
import {RelationsOnlyInRootEntitiesValidator} from "./ast-validation-modules/relations-only-in-root-entities-validator";
import {RelationsOnlyToRootEntitiesValidator} from "./ast-validation-modules/relations-only-to-root-entities-validator";
import {ReferenceOnlyToRootEntitiesWithKeyFieldValidator} from "./ast-validation-modules/references-only-to-root-entities-with-key-field-validator";
import {NoUnusedNonRootObjectTypesValidator} from "./ast-validation-modules/no-unused-non-root-object-types-validator";
import {NoEmptyObjectTypesValidator} from "./ast-validation-modules/no-empty-object-types-validator";
import {NoListsOfListsValidator} from "./ast-validation-modules/no-lists-of-lists-validator";
import {RootEntitiesWithoutReadRolesValidator} from "./ast-validation-modules/root-entities-without-read-roles";
import {NoRolesOnValueObjectsValidator} from "./ast-validation-modules/no-roles-on-value-objects-validator";
import {KnownFieldDirectivesValidator} from "./ast-validation-modules/known-field-directives-validator";
import {KnownObjectTypeDirectivesValidator} from "./ast-validation-modules/known-object-type-directives-validator";
import {ObjectTypeDirectiveCountValidator} from "./ast-validation-modules/object-type-directive-count-validator";
import { CalcMutationsDirectiveValidator } from './ast-validation-modules/calc-mutations-directive-validator';
import {DefaultValueValidator} from "./ast-validation-modules/default-value-validator";
import {CheckDirectedRelationEdgesValidator} from "./ast-validation-modules/check-directed-relation-edges-validator";
import {IndicesValidator} from "./ast-validation-modules/indices-validator";
import { ProjectSource } from '../../project/source';
import { CheckGraphQLSyntaxValidator } from './source-validation-modules/check-graphql-syntax';
import { Project } from '../../project/project';
import { GraphQLRulesValidator } from './source-validation-modules/graphql-rules';
import { CheckYamlSyntaxValidator } from './source-validation-modules/check-yaml-syntax';
import { CheckJsonSyntaxValidator } from './source-validation-modules/check-json-syntax';
import { ASTTransformationContext } from './transformation-pipeline';
import { PermissionProfileMap } from '../../authorization/permission-profile';
import { NoPermissionProfileValidator } from './ast-validation-modules/no-permission-profile';
import { RolesAndPermissionProfileCombinedValidator } from './ast-validation-modules/roles-and-permission-profile-combined';
import { UndefinedPermissionProfileValidator } from './ast-validation-modules/undefined-permission-profile';

const sourceValidators: SourceValidator[]  = [
    new CheckGraphQLSyntaxValidator(),
    new GraphQLRulesValidator(),
    new CheckYamlSyntaxValidator(),
    new CheckJsonSyntaxValidator(),
];

const postMergeValidators: ASTValidator[] = [
    new NoDuplicateTypesValidator(),
    new ObjectTypeDirectiveCountValidator(),
    new OnlyAllowedTypesValidator(),
    new KeyFieldValidator(),
    new EntityDirectiveNestingValidator(),
    new NoListOfReferencesValidator(),
    new RelationsOnlyInRootEntitiesValidator(),
    new RelationsOnlyToRootEntitiesValidator(),
    new ReferenceOnlyToRootEntitiesWithKeyFieldValidator(),
    new NoUnusedNonRootObjectTypesValidator(),
    new NoEmptyObjectTypesValidator(),
    new NoListsOfListsValidator(),
    new RootEntitiesWithoutReadRolesValidator(),
    new NoPermissionProfileValidator(),
    new UndefinedPermissionProfileValidator(),
    new RolesAndPermissionProfileCombinedValidator(),
    new NoRolesOnValueObjectsValidator(),
    new KnownFieldDirectivesValidator(),
    new KnownObjectTypeDirectivesValidator(),
    new CalcMutationsDirectiveValidator(),
    new DefaultValueValidator(),
    new CheckDirectedRelationEdgesValidator(),
    new IndicesValidator()
];

export interface ASTValidator {
    validate(ast: DocumentNode, context: ASTValidationContext): ValidationMessage[];
}

export interface SourceValidator {
    validate(source: ProjectSource): ValidationMessage[];
}

export function validateSource(source: ProjectSource): ValidationResult {
    return new ValidationResult(flatMap(sourceValidators, validator => validator.validate(source)));
}

export function validatePostMerge(ast: DocumentNode, context: ASTValidationContext): ValidationResult {
    return new ValidationResult(flatMap(postMergeValidators, validator => {
        // All validators rely on a valid model except for the things they test.
        // That's why they allow them to throw errors due to a bad model.
        // To keep the validators simple, we just ignore these errors and
        // trust on the appropriate validator for the modelling mistake.
        try {
            return validator.validate(ast, context)
        } catch(e) {
            return []
        }
    }));
}

export interface ASTValidationContext {
    defaultNamespace?: string
    permissionProfiles?: PermissionProfileMap
}

export class ValidationResult {

    constructor(public readonly messages: ValidationMessage[]) {
    }

    public hasErrors() {
        return this.messages.some(message => message.severity === Severity.Error)
    }

    public hasWarnings() {
        return this.messages.some(message => message.severity === Severity.Warning)
    }

    public hasInfos() {
        return this.messages.some(message => message.severity === Severity.Info)
    }
}