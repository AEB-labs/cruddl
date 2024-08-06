import {
    DirectiveNode,
    FieldDefinitionNode,
    Kind,
    Location,
    TypeDefinitionNode,
    isTypeDefinitionNode,
    print,
} from 'graphql';
import {
    ParsedGraphQLProjectSource,
    ParsedObjectProjectSource,
    ParsedProjectSourceBaseKind,
} from '../config/parsed-project';
import { Model, ValidationMessage } from '../model';
import { parseModuleSpecificationExpression } from '../model/implementation/modules/expression-parser';
import { ValidationContext } from '../model/validation/validation-context';
import { MODULES_DIRECTIVE, MODULES_IN_ARG } from '../schema/constants';
import { parseProjectSource } from '../schema/schema-builder';
import { findDirectiveWithName } from '../schema/schema-utils';
import { Project, ProjectOptions } from './project';
import { ProjectSource } from './source';
import { isReadonlyArray } from '../utils/utils';

export interface ModuleSelectionOptions {
    /**
     * If set to true, the module declarations and @modules directives will be removed from the resulting project
     */
    readonly removeModuleDeclarations?: boolean;
}

export function selectModulesInProject(
    project: Project,
    selectedModules: ReadonlyArray<string>,
    options: ModuleSelectionOptions = {},
): Project {
    const removeModuleDeclarations = options.removeModuleDeclarations ?? false;
    const validationContext = new ValidationContext();
    const modelWithModules = project.getModel();
    if (!project.options.modelOptions?.withModuleDefinitions) {
        throw new Error(
            `modelOptions.withModuleDefinitions needs to be enabled in the project options.`,
        );
    }

    const newSources = project.sources.flatMap((source) => {
        const result = selectModulesInProjectSource({
            source,
            validationContext,
            modelWithModules,
            options: project.options,
            selectedModules: new Set(selectedModules),
            removeModuleDeclarations,
        });
        return result ? [result] : [];
    });
    const validationResult = validationContext.asResult();
    if (validationResult.hasErrors()) {
        throw new Error(
            `Errors occurred while selecting modules in project.\n\n` +
                validationResult
                    .getErrors()
                    .map((e) => e.toString())
                    .join('\n'),
        );
    }

    return new Project({
        ...project,
        sources: newSources,
        modelOptions: {
            ...(project.options.modelOptions ?? {}),
            withModuleDefinitions: !removeModuleDeclarations,
        },
    });
}

interface SelectModulesInProjectSourceParams {
    readonly source: ProjectSource;
    readonly options: ProjectOptions;
    readonly modelWithModules: Model;
    readonly selectedModules: Set<string>;
    readonly validationContext: ValidationContext;
    readonly removeModuleDeclarations: boolean;
}

function selectModulesInProjectSource(
    params: SelectModulesInProjectSourceParams,
): ProjectSource | undefined {
    const parsedSource = parseProjectSource(
        params.source,
        params.options,
        params.validationContext,
    );
    if (!parsedSource) {
        return undefined;
    }
    let newBody;
    switch (parsedSource.kind) {
        case ParsedProjectSourceBaseKind.OBJECT:
            newBody = selectModulesInObjectSource({ parsedSource, ...params });
            break;
        case ParsedProjectSourceBaseKind.GRAPHQL:
            newBody = selectModulesInGraphQLSource({ parsedSource, ...params });
            break;
    }
    if (newBody === undefined) {
        return undefined;
    } else if (newBody === params.source.body) {
        return params.source;
    } else {
        return new ProjectSource(params.source.name, newBody, params.source.filePath);
    }
}

interface SelectModulesInObjectSourceParams extends SelectModulesInProjectSourceParams {
    readonly parsedSource: ParsedObjectProjectSource;
}

function selectModulesInObjectSource({
    source,
    parsedSource,
    removeModuleDeclarations,
    selectedModules,
}: SelectModulesInObjectSourceParams): string | undefined {
    if ('modules' in parsedSource.object) {
        // if the file *only* includes module declarations, and we should remove them, we can just remove the file
        if (removeModuleDeclarations && Object.keys(parsedSource.object).length === 1) {
            return undefined;
        }

        // TODO improve editing object sources
        // we need to remove the modules but keep the rest
        // canonot just remove the spans because yaml is whitespace-sensitive
        // should maybe use a source-preserving yaml editor (as yaml is a json superset)
        // for now, just remove the formatting
        const newObject = { ...parsedSource.object };
        if (removeModuleDeclarations) {
            delete newObject.modules;
        } else if (isReadonlyArray(parsedSource.object.modules)) {
            // if we shouldn't remove the module declarations completely, filter it down
            newObject.modules = parsedSource.object.modules.filter(
                (m) => selectedModules.has(m as string), // type assertion is safe for the .has() argument
            );
        }
        return JSON.stringify(newObject, undefined, '  ');
    }

    return source.body;
}

interface SelectModulesInGraphQLSourceParams extends SelectModulesInProjectSourceParams {
    readonly parsedSource: ParsedGraphQLProjectSource;
}

interface Change {
    /**
     * The range of text to delete
     */
    readonly location: Location;
    /**
     * If defined, the text at the location will be replaced by this text. Otherwise, the text at the location will just be deleted.
     */
    readonly replacement?: string;
}

function selectModulesInGraphQLSource({
    source,
    parsedSource,
    modelWithModules,
    validationContext,
    selectedModules,
    removeModuleDeclarations,
}: SelectModulesInGraphQLSourceParams): string | undefined {
    const changes: Change[] = [];

    for (const typeDef of parsedSource.document.definitions) {
        if (isTypeDefinitionNode(typeDef)) {
            const typeName = typeDef.name.value;
            const type = modelWithModules.getType(typeName);
            if (!type) {
                // not really a "validation" error, but we can use the system to link the source locations nicely
                validationContext.addMessage(
                    ValidationMessage.error(
                        `Type "${typeName}" does not exist in model`,
                        typeDef.name,
                    ),
                );
                continue;
            }

            if (!type.effectiveModuleSpecification.includedIn(selectedModules)) {
                if (!typeDef.loc) {
                    throw new Error(`Missing loc`);
                }
                // remove whole type
                changes.push({ location: typeDef.loc });
                continue;
            }

            const moduleChange = changeModuleDirectiveIfNecessary(typeDef, {
                removeModuleDeclarations,
                selectedModules,
            });
            if (moduleChange) {
                changes.push(moduleChange);
            }

            if (typeDef.kind === Kind.OBJECT_TYPE_DEFINITION) {
                if (!type.isObjectType) {
                    validationContext.addMessage(
                        ValidationMessage.error(
                            `Type "${typeName}" is not an object type in the model`,
                            typeDef.name,
                        ),
                    );
                    continue;
                }

                if (!typeDef.fields) {
                    continue;
                }

                for (const fieldDef of typeDef.fields) {
                    const fieldName = fieldDef.name.value;
                    const field = type.getField(fieldName);
                    if (!field) {
                        validationContext.addMessage(
                            ValidationMessage.error(
                                `Field "${typeName}.${fieldName}" does not exist in the model`,
                                typeDef.name,
                            ),
                        );
                        continue;
                    }

                    if (!field.effectiveModuleSpecification.includedIn(selectedModules)) {
                        if (!fieldDef.loc) {
                            throw new Error(`Missing loc`);
                        }
                        // remove field
                        changes.push({ location: fieldDef.loc });
                        continue;
                    }

                    const moduleChange = changeModuleDirectiveIfNecessary(fieldDef, {
                        removeModuleDeclarations,
                        selectedModules,
                    });
                    if (moduleChange) {
                        changes.push(moduleChange);
                    }
                }
            }
        }
    }

    let currentPosition = 0;
    let output = '';
    for (let i = 0; i <= changes.length; i++) {
        // TODO expand the spans to include leading and trailing trivia (such as comments and whitespace)
        const change = changes[i] as Change | undefined;
        const includeUntilIndex = change ? change.location.start : source.body.length;
        if (includeUntilIndex < currentPosition) {
            throw new Error(
                `Changes are not in order: found ${includeUntilIndex} after ${currentPosition}`,
            );
        }
        output += source.body.substring(currentPosition, includeUntilIndex);
        if (change && change.replacement !== undefined) {
            output += change.replacement;
        }
        if (change) {
            currentPosition = changes[i].location.end;
        }
    }

    return output;
}

function changeModuleDirectiveIfNecessary(
    definitionNode: FieldDefinitionNode | TypeDefinitionNode,

    {
        removeModuleDeclarations,
        selectedModules,
    }: { removeModuleDeclarations: boolean; selectedModules: ReadonlySet<string> },
): Change | undefined {
    const modulesDirectve = findDirectiveWithName(definitionNode, MODULES_DIRECTIVE);
    if (!modulesDirectve) {
        return undefined;
    }
    if (!modulesDirectve.loc) {
        throw new Error(`Missing loc on modules directive`);
    }

    if (removeModuleDeclarations) {
        // delete the directive
        return { location: modulesDirectve.loc };
    }

    if (!modulesDirectve.arguments) {
        // no "in" arg specified - do not need to change anything
        return undefined;
    }
    const inArg = modulesDirectve.arguments.find((arg) => arg.name.value === MODULES_IN_ARG);
    if (!inArg) {
        // no "in" arg specified - do not need to change anything
        return undefined;
    }
    // graphql allows you to omit the [] on lists
    const inArgValues = inArg.value.kind === Kind.LIST ? inArg.value.values : [inArg.value];
    const newInValues = inArgValues.filter((clause) => {
        if (clause.kind !== Kind.STRING) {
            // wrong but nothing we need to fix here
            return true;
        }
        const expression = clause.value;
        const parsedExpression = parseModuleSpecificationExpression(expression);
        if (!parsedExpression.andCombinedIdentifiers) {
            // parse error - was wrong before, so just keep it
            return true;
        }
        if (
            parsedExpression.andCombinedIdentifiers.some(
                (identifier) => !selectedModules.has(identifier.name),
            )
        ) {
            // clause includes a module that is not activated -> the clause is not relevant for the target project selection
            return false;
        }
        // keep the clause
        return true;
    });

    const newDirective: DirectiveNode = {
        ...modulesDirectve,
        arguments: [
            ...modulesDirectve.arguments.filter((a) => a !== inArg),
            {
                ...inArg,
                value: {
                    kind: Kind.LIST,
                    values: newInValues,
                },
            },
        ],
    };
    const replacement = print(newDirective);
    return { location: modulesDirectve.loc, replacement };
}
