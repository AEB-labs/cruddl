import { expect } from 'chai';
import { DocumentNode, parse, Source } from 'graphql';
import { ParsedProjectSourceBaseKind } from '../../../src/config/parsed-project';
import {
    createModel,
    PermissionProfileConfigMap,
    TimeToLiveConfig,
    ValidationContext,
    ValidationResult,
} from '../../../src/model';
import { ProjectSource } from '../../../src/project/source';
import {
    validateParsedProjectSource,
    validatePostMerge,
    validateSource,
} from '../../../src/schema/preparation/ast-validator';
import { parseProjectSource } from '../../../src/schema/schema-builder';
import { prettyPrint } from '../../../src/graphql/pretty-print';

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
