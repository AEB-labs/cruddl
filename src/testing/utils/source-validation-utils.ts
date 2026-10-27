import type { DocumentNode } from 'graphql';
import { parse, Source } from 'graphql';
import { expect } from 'vitest';
import { prettyPrint } from '../../core/graphql/pretty-print.js';
import { applyChangeSet } from '../../core/model/change-set/apply-change-set.js';
import type { PermissionProfileConfigMap } from '../../core/model/config/permissions.js';
import type { TimeToLiveConfig } from '../../core/model/config/time-to-live.js';
import { createModel } from '../../core/model/create-model.js';
import type { ValidationMessage } from '../../core/model/validation/message.js';
import { Severity } from '../../core/model/validation/message.js';
import { ValidationResult } from '../../core/model/validation/result.js';
import { ValidationContext } from '../../core/model/validation/validation-context.js';
import { Project } from '../../core/project/project.js';
import { ProjectSource } from '../../core/project/source.js';
import { parseProjectSource } from '../../core/schema/parsing/parse-project-source.js';
import { ParsedProjectSourceBaseKind } from '../../core/schema/parsing/parsed-project.js';
import {
    validateParsedProjectSource,
    validatePostMerge,
    validateSource,
} from '../../core/schema/preparation/ast-validator.js';

export function assertValidatorRejects(
    source: string | DocumentNode,
    msg: string | ReadonlyArray<string>,
    options?: ValidationOptions,
) {
    const messages = Array.isArray(msg) ? msg : [msg];
    const validationResult = validate(source, options);
    expect(validationResult.hasErrors()).to.be.true;
    expect(
        validationResult.getErrors().map((e) => e.message),
        validationResult.toString(),
    ).to.deep.equal(messages);
}

/**
 * Asserts that there are no errors and that the warnings are exactly the given messages
 */
export function assertValidatorWarns(
    source: string | DocumentNode,
    msg: string | ReadonlyArray<string>,
    options?: ValidationOptions,
) {
    const messages = typeof msg === 'string' ? [msg] : msg;
    const validationResult = validate(source, options);
    expect(validationResult.hasErrors(), validationResult.toString()).to.be.false;
    expect(
        validationResult.messages
            .filter((m) => m.severity === Severity.WARNING)
            .map((m) => m.message),
        validationResult.toString(),
    ).to.deep.equal(messages);
}

export function assertValidatorAcceptsAndDoesNotWarn(
    source: string | DocumentNode,
    options?: ValidationOptions,
) {
    const validationResult = validate(source, options);
    expect(validationResult.hasErrors(), validationResult.toString()).to.be.false;
    expect(validationResult.hasWarnings(), validationResult.toString()).to.be.false;
}

export interface ValidationOptions {
    readonly permissionProfiles?: PermissionProfileConfigMap;
    timeToLive?: ReadonlyArray<TimeToLiveConfig>;
    withModuleDefinitions?: boolean;
}

export function validate(
    source: string | DocumentNode,
    options: ValidationOptions = {},
): ValidationResult {
    const ast = typeof source === 'string' ? parse(new Source(source, 'schema.graphqls')) : source;
    const projectSource = new ProjectSource(
        'schema.graphqls',
        typeof source === 'string' ? source : (source.loc?.source?.body ?? prettyPrint(source)),
    );
    const sourceResults = validateSource(projectSource);
    const validationContext = new ValidationContext();
    const parsedSource = parseProjectSource(projectSource, {}, validationContext);
    let parsedSourceResults: ValidationResult | undefined;
    if (parsedSource) {
        parsedSourceResults = validateParsedProjectSource(parsedSource);
    }

    const intermediateResult = new ValidationResult([
        ...sourceResults.messages,
        ...validationContext.asResult().messages,
        ...(parsedSourceResults ? parsedSourceResults.messages : []),
    ]);
    if (intermediateResult.hasErrors()) {
        return intermediateResult;
    }

    const model = createModel(
        {
            sources: [
                {
                    kind: ParsedProjectSourceBaseKind.GRAPHQL,
                    document: ast,
                    namespacePath: [],
                },
                {
                    kind: ParsedProjectSourceBaseKind.OBJECT,
                    object: {
                        permissionProfiles: options.permissionProfiles || {
                            default: {
                                permissions: [
                                    {
                                        roles: ['admin'],
                                        access: 'readWrite',
                                    },
                                ],
                            },
                        },
                        timeToLive: options.timeToLive,
                        modules: options.withModuleDefinitions
                            ? ['module1', 'module2', 'module3']
                            : undefined,
                    },
                    namespacePath: [],
                    pathLocationMap: {},
                },
            ],
        },
        { withModuleDefinitions: options.withModuleDefinitions },
    );
    const astResults = validatePostMerge(ast, model);

    return new ValidationResult([
        ...model.validate().messages,
        ...astResults.messages,
        ...intermediateResult.messages,
    ]);
}

/**
 * Applies the quick fix with the given description and returns the new body of the changed source
 */
export function applyQuickFix(
    messages: ReadonlyArray<ValidationMessage>,
    description: string,
): string {
    const quickFixes = messages
        .flatMap((m) => m.quickFixes)
        .filter((q) => q.description === description);
    expect(
        quickFixes.map((q) => q.description),
        messages.map((m) => m.toString()).join('\n'),
    ).to.deep.equal([description]);
    const changeSet = quickFixes[0].getChangeSet();
    const source = changeSet.textChanges[0].source;
    const newProject = applyChangeSet(new Project([source]), changeSet);
    return newProject.sources[0].body;
}
