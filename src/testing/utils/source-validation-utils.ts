import type { DocumentNode } from 'graphql';
import { parse, Source } from 'graphql';
import { expect } from 'vitest';
import { prettyPrint } from '../../graphql/pretty-print.js';
import type { PermissionProfileConfigMap } from '../../model/config/permissions.js';
import type { TimeToLiveConfig } from '../../model/config/time-to-live.js';
import { createModel } from '../../model/create-model.js';
import { ValidationResult } from '../../model/validation/result.js';
import { ValidationContext } from '../../model/validation/validation-context.js';
import { ProjectSource } from '../../project/source.js';
import { parseProjectSource } from '../../schema/parsing/parse-project-source.js';
import { ParsedProjectSourceBaseKind } from '../../schema/parsing/parsed-project.js';
import {
    validateParsedProjectSource,
    validatePostMerge,
    validateSource,
} from '../../schema/preparation/ast-validator.js';

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

export function assertValidatorWarns(
    source: string | DocumentNode,
    msg: string,
    options?: ValidationOptions,
) {
    const validationResult = validate(source, options);
    expect(validationResult.hasErrors(), validationResult.toString()).to.be.false;
    expect(validationResult.hasWarnings()).to.be.true;
    expect(
        validationResult.messages.find((validatedMsg) => validatedMsg.message === msg),
        validationResult.toString(),
    ).to.not.be.undefined;
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
