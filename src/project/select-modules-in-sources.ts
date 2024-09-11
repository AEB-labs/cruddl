import {
    DirectiveNode,
    FieldDefinitionNode,
    isTypeDefinitionNode,
    Kind,
    ListValueNode,
    Location,
    ObjectValueNode,
    print,
    StringValueNode,
    TypeDefinitionNode,
} from 'graphql';
import {
    ParsedGraphQLProjectSource,
    ParsedObjectProjectSource,
    ParsedProjectSourceBaseKind,
} from '../config/parsed-project';
import { IndexField, Model, RootEntityType, ValidationMessage } from '../model';
import { parseModuleSpecificationExpression } from '../model/implementation/modules/expression-parser';
import { ValidationContext } from '../model/validation/validation-context';
import {
    INDICES_ARG,
    MODULES_DIRECTIVE,
    MODULES_IN_ARG,
    ROOT_ENTITY_DIRECTIVE,
} from '../schema/constants';
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
        ...project.options,
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

                if (type.isRootEntityType) {
                    changes.push(...changeIndicesIfNecessary(typeDef, type, selectedModules));
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
    const sortedChanges = [...changes].sort((a, b) => a.location.start - b.location.start);
    for (let i = 0; i <= sortedChanges.length; i++) {
        // TODO expand the spans to include leading and trailing trivia (such as comments and whitespace)
        const change = sortedChanges[i] as Change | undefined;
        const includeUntilIndex = change ? change.location.start : source.body.length;
        if (includeUntilIndex < currentPosition) {
            throw new Error(
                `Changes are overlapping: found ${includeUntilIndex} after ${currentPosition}`,
            );
        }
        output += source.body.substring(currentPosition, includeUntilIndex);
        if (change && change.replacement !== undefined) {
            output += change.replacement;
        }
        if (change) {
            currentPosition = change.location.end;
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

function changeIndicesIfNecessary(
    definitionNode: TypeDefinitionNode,
    type: RootEntityType,
    selectedModules: ReadonlySet<string>,
): ReadonlyArray<Change> {
    const rootEntityDirective = findDirectiveWithName(definitionNode, ROOT_ENTITY_DIRECTIVE);
    if (!rootEntityDirective || !rootEntityDirective.loc) {
        return [];
    }
    const indicesArg = rootEntityDirective.arguments?.find((a) => a.name.value === INDICES_ARG);
    if (!indicesArg || !indicesArg.loc || indicesArg.value.kind !== Kind.LIST) {
        // nothing to do when there is no indices arg or if it has an invalid value (not a list),
        // and nothing we can do if it does not have a location
        return [];
    }

    const indexDefs = indicesArg.value.values.filter((v) => v.kind === Kind.OBJECT);
    const changes: Change[] = [];
    let removedIndexCount = 0;
    for (const indexDef of indexDefs) {
        if (!indexDef.loc) {
            // if we don't have a location, cannot remove or change anything
            continue;
        }
        const change = changeIndexIfNecessary(indexDef, type, selectedModules);
        if (change.remove) {
            removedIndexCount++;
            changes.push({ location: indexDef.loc });
        } else if (change.changeFields) {
            const fieldsArg = indexDef.fields.find((f) => f.name.value === 'fields');
            if (fieldsArg && fieldsArg.value.loc) {
                const valueNode: ListValueNode = {
                    kind: Kind.LIST,
                    values: change.changeFields.map(
                        (field): StringValueNode => ({
                            kind: Kind.STRING,
                            value: field,
                        }),
                    ),
                };
                changes.push({ location: fieldsArg.value.loc, replacement: print(valueNode) });
            }
        }
    }

    // If we're removing all indices, rather remove the whole argument
    if (removedIndexCount === indicesArg.value.values.length) {
        if (rootEntityDirective.arguments?.length === 1) {
            // if there was no other argument besides "indices", just re-emit the @rootEntity
            // directive (we need to remove the (), and there is nothing else that would get
            // re-formatted by this operation
            const newDirective: DirectiveNode = {
                ...rootEntityDirective,
                arguments: undefined,
            };
            return [{ location: rootEntityDirective.loc, replacement: print(newDirective) }];
        } else {
            return [{ location: indicesArg.loc }];
        }
    }

    // does not delete potential commas between the indices. However, indices are usually so long
    // that there is one per line, and you probably don't use commas then (prettier does not)
    // it does leave a lot of whitespace, but that's a common problem (and can be fixed by running
    // prettier after withModuleSelection())
    return changes;
}

interface IndexChange {
    readonly remove?: boolean;
    readonly changeFields?: ReadonlyArray<string>;
}

function changeIndexIfNecessary(
    indexDef: ObjectValueNode,
    type: RootEntityType,
    selectedModules: ReadonlySet<string>,
): IndexChange {
    const fieldsArg = indexDef.fields.find((f) => f.name.value === 'fields');
    if (!fieldsArg) {
        // invalid index - do not change anything
        return {};
    }
    let fields: ReadonlyArray<string>;
    if (fieldsArg.value.kind === Kind.STRING) {
        fields = [fieldsArg.value.value];
    } else if (fieldsArg.value.kind === Kind.LIST) {
        fields = fieldsArg.value.values.filter((v) => v.kind === Kind.STRING).map((v) => v.value);
    } else {
        // invalid index - do not change anything
        return {};
    }

    const fieldsSoFar: string[] = [];
    for (const field of fields) {
        // we can't really use one of the actual IndexField instances in the type because they
        // are sometimes augmented with additional fields to make the indices unique
        const indexField = new IndexField(field, type, undefined);
        const fieldsInPath = indexField.fieldsInPath;
        if (!fieldsInPath) {
            // if there is an error resolving the field paths, we can't really do anything
            // behave like in other situations here and in doubt do not touch the definition
            return {};
        }

        if (fieldsInPath.some((f) => !f.effectiveModuleSpecification.includedIn(selectedModules))) {
            // The index is not fully covered by the selected modules
            const uniqueArg = indexDef.fields.find((f) => f.name.value === 'unique');
            if (uniqueArg && uniqueArg.value.kind === Kind.BOOLEAN && uniqueArg.value.value) {
                // A unique index that is not fully covered needs to be removed
                // (if we were to keep a prefix of the index, the unique behavior would change)
                return { remove: true };
            }

            if (fieldsSoFar.length) {
                // for non-unique indices, include a prefix index
                // TODO only include this prefix index if there isn't already an identical one
                return { changeFields: fieldsSoFar };
            } else {
                return { remove: true };
            }
        }

        fieldsSoFar.push(field);
    }

    // all fields are covered - no change needed
    return {};
}
