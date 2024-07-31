import {
    ArgumentNode,
    DirectiveNode,
    EnumTypeDefinitionNode,
    EnumValueDefinitionNode,
    EnumValueNode,
    FieldDefinitionNode,
    GraphQLBoolean,
    GraphQLEnumType,
    GraphQLInputObjectType,
    GraphQLInt,
    GraphQLList,
    GraphQLNonNull,
    GraphQLString,
    Kind,
    ObjectTypeDefinitionNode,
    ObjectValueNode,
    StringValueNode,
    TypeDefinitionNode,
    valueFromAST,
    ValueNode,
} from 'graphql';
import { ModelOptions } from '../config/interfaces';
import {
    ParsedGraphQLProjectSource,
    ParsedObjectProjectSource,
    ParsedProject,
    ParsedProjectSourceBaseKind,
} from '../config/parsed-project';
import { getValueFromAST } from '../graphql/value-from-ast';
import {
    ACCESS_FIELD_DIRECTIVE,
    BUSINESS_OBJECT_DIRECTIVE,
    CALC_MUTATIONS_DIRECTIVE,
    CALC_MUTATIONS_OPERATORS_ARG,
    CHILD_ENTITY_DIRECTIVE,
    COLLECT_AGGREGATE_ARG,
    COLLECT_DIRECTIVE,
    COLLECT_PATH_ARG,
    DEFAULT_VALUE_DIRECTIVE,
    ENTITY_EXTENSION_DIRECTIVE,
    FLEX_SEARCH_CASE_SENSITIVE_ARGUMENT,
    FLEX_SEARCH_DEFAULT_LANGUAGE_ARG,
    FLEX_SEARCH_FULLTEXT_INDEXED_DIRECTIVE,
    FLEX_SEARCH_INCLUDED_IN_SEARCH_ARGUMENT,
    FLEX_SEARCH_INDEXED_ARGUMENT,
    FLEX_SEARCH_INDEXED_DIRECTIVE,
    FLEX_SEARCH_INDEXED_LANGUAGE_ARG,
    FLEX_SEARCH_ORDER_ARGUMENT,
    FLEX_SEARCH_PERFORMANCE_PARAMS_ARGUMENT,
    HIDDEN_DIRECTIVE,
    ID_FIELD,
    INDEX_DEFINITION_INPUT_TYPE,
    INDEX_DIRECTIVE,
    INDICES_ARG,
    INVERSE_OF_ARG,
    KEY_FIELD_ARG,
    KEY_FIELD_DIRECTIVE,
    MODULES_ALL_ARG,
    MODULES_DIRECTIVE,
    MODULES_IN_ARG,
    MODULES_INCLUDE_ALL_FIELDS_ARG,
    NAMESPACE_DIRECTIVE,
    NAMESPACE_NAME_ARG,
    NAMESPACE_SEPARATOR,
    OBJECT_TYPE_KIND_DIRECTIVES,
    ON_DELETE_ARG,
    PARENT_DIRECTIVE,
    PERMISSION_PROFILE_ARG,
    REFERENCE_DIRECTIVE,
    RELATION_DIRECTIVE,
    ROLES_DIRECTIVE,
    ROLES_READ_ARG,
    ROLES_READ_WRITE_ARG,
    ROOT_DIRECTIVE,
    ROOT_ENTITY_DIRECTIVE,
    UNIQUE_DIRECTIVE,
    VALUE_ARG,
    VALUE_OBJECT_DIRECTIVE,
} from '../schema/constants';
import {
    findDirectiveWithName,
    getDeprecationReason,
    getNamedTypeNodeIgnoringNonNullAndList,
    getNodeByName,
    getTypeNameIgnoringNonNullAndList,
    hasDirectiveWithName,
} from '../schema/schema-utils';
import { compact, flatMap, mapValues } from '../utils/utils';
import {
    AggregationOperator,
    CalcMutationsOperator,
    CollectFieldConfig,
    EnumTypeConfig,
    EnumValueConfig,
    FieldConfig,
    FlexSearchIndexConfig,
    FlexSearchLanguage,
    FlexSearchPerformanceParams,
    FlexSearchPrimarySortClauseConfig,
    IndexDefinitionConfig,
    LocalizationConfig,
    NamespacedPermissionProfileConfigMap,
    ObjectTypeConfig,
    PermissionProfileConfigMap,
    PermissionsConfig,
    RelationDeleteAction,
    RolesSpecifierConfig,
    TimeToLiveConfig,
    TypeConfig,
    TypeConfigBase,
    TypeKind,
} from './config';
import { BillingConfig } from './config/billing';
import { ModuleConfig } from './config/module';
import {
    FieldModuleSpecificationConfig,
    TypeModuleSpecificationConfig,
} from './config/module-specification';
import { Model } from './implementation';
import { OrderDirection } from './implementation/order';
import { parseBillingConfigs } from './parse-billing';
import { parseI18nConfigs } from './parse-i18n';
import { parseModuleConfigs } from './parse-modules';
import { parseTTLConfigs } from './parse-ttl';
import { ValidationContext, ValidationMessage } from './validation';

export function createModel(parsedProject: ParsedProject, options: ModelOptions = {}): Model {
    const validationContext = new ValidationContext();
    return new Model({
        types: createTypeInputs(parsedProject, validationContext, options),
        permissionProfiles: extractPermissionProfiles(parsedProject),
        i18n: extractI18n(parsedProject),
        billing: extractBilling(parsedProject),
        timeToLiveConfigs: extractTimeToLive(parsedProject),
        modules: extractModules(parsedProject, options, validationContext),

        // access this after the other function calls so we have collected all messages
        // (it's currently passed by reference but let's not rely on that)
        validationMessages: validationContext.validationMessages,
        options,
    });
}

const VALIDATION_ERROR_INVALID_PERMISSION_PROFILE = `Invalid argument value, expected string`;
const VALIDATION_ERROR_EXPECTED_STRING_OR_LIST_OF_STRINGS = 'Expected string or list of strings';
const VALIDATION_ERROR_EXPECTED_BOOLEAN = 'Expected boolean';
const VALIDATION_ERROR_EXPECTED_ENUM_OR_LIST_OF_ENUMS = 'Expected enum or list of enums';
const VALIDATION_ERROR_EXPECTED_ENUM = 'Expected enum';
const VALIDATION_ERROR_INVERSE_OF_ARG_MUST_BE_STRING = 'inverseOf must be specified as String';
const VALIDATION_ERROR_MISSING_ARGUMENT_OPERATORS = "Missing argument 'operators'";
const VALIDATION_ERROR_MISSING_ARGUMENT_DEFAULT_VALUE =
    DEFAULT_VALUE_DIRECTIVE + ' needs an argument named ' + VALUE_ARG;
const VALIDATION_ERROR_INVALID_ARGUMENT_TYPE = 'Invalid argument type.';
const VALIDATION_ERROR_DUPLICATE_KEY_FIELD = 'Only one field can be a @key field.';
const VALIDATION_ERROR_MULTIPLE_OBJECT_TYPE_DIRECTIVES = `Only one of @${ROOT_ENTITY_DIRECTIVE}, @${CHILD_ENTITY_DIRECTIVE}, @${ENTITY_EXTENSION_DIRECTIVE} or @${VALUE_OBJECT_DIRECTIVE} can be used.`;
const VALIDATION_ERROR_MISSING_OBJECT_TYPE_DIRECTIVE = `Add one of @${ROOT_ENTITY_DIRECTIVE}, @${CHILD_ENTITY_DIRECTIVE}, @${ENTITY_EXTENSION_DIRECTIVE} or @${VALUE_OBJECT_DIRECTIVE}.`;
const VALIDATION_ERROR_INVALID_DEFINITION_KIND =
    'This kind of definition is not allowed. Only object and enum type definitions are allowed.';

function createTypeInputs(
    parsedProject: ParsedProject,
    context: ValidationContext,
    options: ModelOptions,
): ReadonlyArray<TypeConfig> {
    const graphQLSchemaParts = parsedProject.sources.filter(
        (parsedSource) => parsedSource.kind === ParsedProjectSourceBaseKind.GRAPHQL,
    ) as ReadonlyArray<ParsedGraphQLProjectSource>;
    return flatMap(graphQLSchemaParts, (schemaPart) =>
        compact(
            schemaPart.document.definitions.map((definition) => {
                // Only look at object types and enums (scalars are not supported yet, they need to be implemented somehow, e.g. via regex check)
                if (
                    definition.kind != Kind.OBJECT_TYPE_DEFINITION &&
                    definition.kind !== Kind.ENUM_TYPE_DEFINITION
                ) {
                    context.addMessage(
                        ValidationMessage.error(
                            VALIDATION_ERROR_INVALID_DEFINITION_KIND,
                            definition,
                        ),
                    );
                    return undefined;
                }

                const commonConfig: Omit<TypeConfigBase, 'kind'> = {
                    namespacePath: getNamespacePath(definition, schemaPart.namespacePath),
                    description: definition.description ? definition.description.value : undefined,
                    name: definition.name.value,
                    moduleSpecification: getTypeModuleSpecification(definition, context, options),
                };

                switch (definition.kind) {
                    case Kind.ENUM_TYPE_DEFINITION:
                        const enumTypeInput: EnumTypeConfig = {
                            ...commonConfig,
                            astNode: definition,
                            kind: TypeKind.ENUM,
                            values: createEnumValues(definition.values || []),
                        };
                        return enumTypeInput;
                    case Kind.OBJECT_TYPE_DEFINITION:
                        return createObjectTypeInput(
                            definition,
                            commonConfig,
                            schemaPart,
                            context,
                            options,
                        );
                    default:
                        return undefined;
                }
            }),
        ),
    );
}

function createEnumValues(
    valueNodes: ReadonlyArray<EnumValueDefinitionNode>,
): ReadonlyArray<EnumValueConfig> {
    return valueNodes.map(
        (valNode): EnumValueConfig => ({
            value: valNode.name.value,
            description: valNode.description && valNode.description.value,
            deprecationReason: getDeprecationReason(valNode),
            astNode: valNode,
        }),
    );
}

function createObjectTypeInput(
    definition: ObjectTypeDefinitionNode,
    commonConfig: Omit<TypeConfigBase, 'kind'>,
    schemaPart: ParsedGraphQLProjectSource,
    context: ValidationContext,
    options: ModelOptions,
): ObjectTypeConfig {
    const entityType = getKindOfObjectTypeNode(definition, context);

    const common = {
        ...commonConfig,
        astNode: definition,
        fields: (definition.fields || []).map((field) => createFieldInput(field, context, options)),
        flexSearchLanguage: getDefaultLanguage(definition, context),
    };

    const businessObjectDirective = findDirectiveWithName(definition, BUSINESS_OBJECT_DIRECTIVE);
    if (businessObjectDirective && !findDirectiveWithName(definition, ROOT_ENTITY_DIRECTIVE)) {
        context.addMessage(
            ValidationMessage.error(
                `The directive @${BUSINESS_OBJECT_DIRECTIVE} can only be used on root entity type definitions.`,
                definition.loc,
            ),
        );
    }

    switch (entityType) {
        case CHILD_ENTITY_DIRECTIVE:
            return {
                kind: TypeKind.CHILD_ENTITY,
                ...common,
            };
        case ENTITY_EXTENSION_DIRECTIVE:
            return {
                kind: TypeKind.ENTITY_EXTENSION,
                ...common,
            };
        case VALUE_OBJECT_DIRECTIVE:
            return {
                kind: TypeKind.VALUE_OBJECT,
                ...common,
            };
        default:
            // interpret unknown kinds as root entity because they are least likely to cause unnecessary errors
            // (errors are already reported in getKindOfObjectTypeNode)

            return {
                ...common,
                ...processKeyField(definition, common.fields, context),
                kind: TypeKind.ROOT_ENTITY,
                permissions: getPermissions(definition, context),
                indices: createIndexDefinitionInputs(definition, context),
                flexSearchIndexConfig: createFlexSearchDefinitionInputs(definition, context),
                isBusinessObject: !!businessObjectDirective,
            };
    }
}

/**
 * Extract the @key field
 *
 * id: ID @key means that 'id' is the @key field
 * for backwards compatibility, we also support _key: String @key
 */
function processKeyField(
    definition: ObjectTypeDefinitionNode,
    fields: ReadonlyArray<FieldConfig>,
    context: ValidationContext,
) {
    let keyFieldASTNode: FieldDefinitionNode | undefined = getKeyFieldASTNode(definition, context);
    let keyFieldName: string | undefined = keyFieldASTNode ? keyFieldASTNode.name.value : undefined;
    const underscoreKeyField = fields.find((field) => field.name == '_key');
    if (underscoreKeyField) {
        fields = fields.filter((f) => f !== underscoreKeyField);
        if (keyFieldASTNode && keyFieldASTNode.name.value === underscoreKeyField.name) {
            // keyFieldName needs to be "id" if the @key directive is set on the _key field
            keyFieldASTNode = underscoreKeyField.astNode;
            keyFieldName = ID_FIELD;
            context.addMessage(
                ValidationMessage.warn(
                    `The field "_key" is deprecated and should be replaced with "id" (of type "ID").`,
                    underscoreKeyField.astNode,
                ),
            );
        } else {
            context.addMessage(
                ValidationMessage.error(
                    `The field name "_key" is reserved and can only be used in combination with @key.`,
                    underscoreKeyField.astNode,
                ),
            );
        }
    }

    return { fields, keyFieldASTNode, keyFieldName };
}

function getDefaultValue(fieldNode: FieldDefinitionNode, context: ValidationContext): any {
    const defaultValueDirective = findDirectiveWithName(fieldNode, DEFAULT_VALUE_DIRECTIVE);
    if (!defaultValueDirective) {
        return undefined;
    }
    const defaultValueArg = getNodeByName(defaultValueDirective.arguments, VALUE_ARG);
    if (!defaultValueArg) {
        context.addMessage(
            ValidationMessage.error(
                VALIDATION_ERROR_MISSING_ARGUMENT_DEFAULT_VALUE,
                defaultValueDirective,
            ),
        );
        return undefined;
    }
    return getValueFromAST(defaultValueArg.value);
}

function getFlexSearchOrder(
    rootEntityDirective: DirectiveNode,
    context: ValidationContext,
): ReadonlyArray<FlexSearchPrimarySortClauseConfig> {
    const argumentNode: ArgumentNode | undefined = getNodeByName(
        rootEntityDirective.arguments,
        FLEX_SEARCH_ORDER_ARGUMENT,
    );

    if (!argumentNode) {
        return [];
    }

    if (argumentNode.value.kind === Kind.LIST) {
        return argumentNode.value.values.map((v) => createFlexSearchPrimarySortClause(v, context));
    } else {
        // graphql syntax allows list values to be defined without [] which results in an OBJECT
        return [createFlexSearchPrimarySortClause(argumentNode.value, context)];
    }
}

function getFlexSearchPerformanceParams(
    rootEntityDirective: DirectiveNode,
): FlexSearchPerformanceParams | undefined {
    const argumentNode: ArgumentNode | undefined = getNodeByName(
        rootEntityDirective.arguments,
        FLEX_SEARCH_PERFORMANCE_PARAMS_ARGUMENT,
    );

    if (!argumentNode || argumentNode.value.kind !== 'ObjectValue') {
        return undefined;
    }

    const commitIntervalMsecASTNode = argumentNode.value.fields.find(
        (f) => f.name.value === 'commitIntervalMsec',
    )?.value;
    let commitIntervalMsec: number | undefined = undefined;
    if (commitIntervalMsecASTNode?.kind === 'IntValue') {
        commitIntervalMsec = GraphQLInt.parseLiteral(commitIntervalMsecASTNode);
    }

    const consolidationIntervalMsecASTNode = argumentNode.value.fields.find(
        (f) => f.name.value === 'consolidationIntervalMsec',
    )?.value;
    let consolidationIntervalMsec: number | undefined = undefined;
    if (consolidationIntervalMsecASTNode?.kind === 'IntValue') {
        consolidationIntervalMsec = GraphQLInt.parseLiteral(consolidationIntervalMsecASTNode);
    }

    const cleanupIntervalStepASTNode = argumentNode.value.fields.find(
        (f) => f.name.value === 'cleanupIntervalStep',
    )?.value;
    let cleanupIntervalStep: number | undefined = undefined;
    if (cleanupIntervalStepASTNode?.kind === 'IntValue') {
        cleanupIntervalStep = GraphQLInt.parseLiteral(cleanupIntervalStepASTNode);
    }

    return {
        consolidationIntervalMsec,
        cleanupIntervalStep,
        commitIntervalMsec,
        cleanupIntervalStepASTNode,
        commitIntervalMsecASTNode,
        consolidationIntervalMsecASTNode,
    };
}

function createFlexSearchPrimarySortClause(
    valueNode: ValueNode,
    context: ValidationContext,
): FlexSearchPrimarySortClauseConfig {
    if (valueNode.kind !== Kind.OBJECT) {
        // this is a graphql validation error
        throw new Error(
            `Expected FlexSearchOrderArgument value to be OBJECT, is ${valueNode.kind}`,
        );
    }

    const fieldNode = valueNode.fields.find((f) => f.name.value === 'field');
    const directionNode = valueNode.fields.find((f) => f.name.value === 'direction');

    if (!fieldNode || fieldNode?.value.kind !== Kind.STRING) {
        // this is a graphql validation error
        throw new Error(
            `Expected "field" field of FlexSearchOrderArgument to be STRING, but is ${fieldNode?.value.kind}`,
        );
    }

    let direction: OrderDirection;
    let directionASTNode: EnumValueNode | undefined;
    if (!directionNode) {
        // a missing direction was just silently be ignored and assumed to be ASC in the past
        // for a migration period, treat it as a warning
        context.addMessage(
            ValidationMessage.warn(
                `Field "FlexSearchOrderArgument.direction" of required type "OrderDirection!" was not provided. "ASC" will be assumed. This will be an error in a future release.`,
                valueNode,
            ),
        );
        direction = OrderDirection.ASCENDING;
    } else if (directionNode?.value.kind !== Kind.ENUM) {
        // this is a graphql validation error
        throw new Error(
            `Expected "direction" field of FlexSearchOrderArgument to be ENUM, but is ${directionNode.value.kind}`,
        );
    } else {
        directionASTNode = directionNode.value;
        direction =
            directionASTNode.value === 'DESC'
                ? OrderDirection.DESCENDING
                : OrderDirection.ASCENDING;
    }

    return {
        field: fieldNode?.value.value,
        fieldASTNode: fieldNode?.value,
        direction,
        directionASTNode,
    };
}

function createFlexSearchDefinitionInputs(
    objectNode: ObjectTypeDefinitionNode,
    context: ValidationContext,
): FlexSearchIndexConfig {
    let isIndexed = false;
    const directive = findDirectiveWithName(objectNode, ROOT_ENTITY_DIRECTIVE);
    if (directive) {
        const argumentIndexed: ArgumentNode | undefined = getNodeByName(
            directive.arguments,
            FLEX_SEARCH_INDEXED_ARGUMENT,
        );
        if (argumentIndexed) {
            if (argumentIndexed.value.kind === 'BooleanValue') {
                isIndexed = argumentIndexed.value.value;
            }
        }
    }

    return {
        isIndexed,
        directiveASTNode: directive,
        primarySort: directive ? getFlexSearchOrder(directive, context) : [],
        performanceParams: directive ? getFlexSearchPerformanceParams(directive) : undefined,
    };
}

function getFlexSearchIndexCaseSensitiveNode(
    fieldNode: FieldDefinitionNode,
    context: ValidationContext,
): ArgumentNode | undefined {
    const directive = findDirectiveWithName(fieldNode, FLEX_SEARCH_INDEXED_DIRECTIVE);
    if (directive) {
        const argument = getNodeByName(directive.arguments, FLEX_SEARCH_CASE_SENSITIVE_ARGUMENT);
        if (argument) {
            if (argument.value.kind === 'BooleanValue') {
                return argument;
            }
        }
    }
    return undefined;
}

function getIsIncludedInSearch(
    fieldNode: FieldDefinitionNode,
    context: ValidationContext,
): boolean {
    const directive = findDirectiveWithName(fieldNode, FLEX_SEARCH_INDEXED_DIRECTIVE);
    if (directive) {
        const argument = getNodeByName(
            directive.arguments,
            FLEX_SEARCH_INCLUDED_IN_SEARCH_ARGUMENT,
        );
        if (argument) {
            if (argument.value.kind === 'BooleanValue') {
                return argument.value.value;
            } else {
                context.addMessage(
                    ValidationMessage.error(VALIDATION_ERROR_EXPECTED_BOOLEAN, argument.value.loc),
                );
            }
        }
    }
    return false;
}

function getIsFulltextIncludedInSearch(
    fieldNode: FieldDefinitionNode,
    context: ValidationContext,
): boolean {
    const directive = findDirectiveWithName(fieldNode, FLEX_SEARCH_FULLTEXT_INDEXED_DIRECTIVE);
    if (directive) {
        const argument = getNodeByName(
            directive.arguments,
            FLEX_SEARCH_INCLUDED_IN_SEARCH_ARGUMENT,
        );
        if (argument) {
            if (argument.value.kind === 'BooleanValue') {
                return argument.value.value;
            } else {
                context.addMessage(
                    ValidationMessage.error(VALIDATION_ERROR_EXPECTED_BOOLEAN, argument.value.loc),
                );
            }
        }
    }
    return false;
}

function getDefaultLanguage(
    objectTypeDefinitionNode: ObjectTypeDefinitionNode,
    context: ValidationContext,
): FlexSearchLanguage | undefined {
    let directive: DirectiveNode | undefined =
        findDirectiveWithName(objectTypeDefinitionNode, ROOT_ENTITY_DIRECTIVE) ||
        findDirectiveWithName(objectTypeDefinitionNode, CHILD_ENTITY_DIRECTIVE) ||
        findDirectiveWithName(objectTypeDefinitionNode, VALUE_OBJECT_DIRECTIVE) ||
        findDirectiveWithName(objectTypeDefinitionNode, ENTITY_EXTENSION_DIRECTIVE);
    if (!directive) {
        return undefined;
    }
    const argument: ArgumentNode | undefined = getNodeByName(
        directive.arguments,
        FLEX_SEARCH_DEFAULT_LANGUAGE_ARG,
    );
    if (!argument) {
        return undefined;
    }

    if (argument.value.kind === 'EnumValue') {
        return argument.value.value as FlexSearchLanguage;
    } else {
        context.addMessage(
            ValidationMessage.error(VALIDATION_ERROR_EXPECTED_ENUM, argument.value.loc),
        );
        return undefined;
    }
}

function getLanguage(
    fieldNode: FieldDefinitionNode,
    context: ValidationContext,
): FlexSearchLanguage | undefined {
    let directive: DirectiveNode | undefined = findDirectiveWithName(
        fieldNode,
        FLEX_SEARCH_FULLTEXT_INDEXED_DIRECTIVE,
    );
    if (!directive) {
        return undefined;
    }
    const argument: ArgumentNode | undefined = getNodeByName(
        directive.arguments,
        FLEX_SEARCH_INDEXED_LANGUAGE_ARG,
    );
    if (!argument) {
        return undefined;
    }

    if (argument.value.kind === 'EnumValue') {
        return argument.value.value as FlexSearchLanguage;
    } else {
        context.addMessage(
            ValidationMessage.error(VALIDATION_ERROR_EXPECTED_ENUM, argument.value.loc),
        );
        return undefined;
    }
}

function createFieldInput(
    fieldNode: FieldDefinitionNode,
    context: ValidationContext,
    options: ModelOptions,
): FieldConfig {
    const inverseOfASTNode = getInverseOfASTNode(fieldNode, context);
    const relationAstNode = findDirectiveWithName(fieldNode, RELATION_DIRECTIVE);
    const relationDeleteActionASTNode = getRelationDeleteActionASTNode(fieldNode, context);
    const referenceDirectiveASTNode = findDirectiveWithName(fieldNode, REFERENCE_DIRECTIVE);
    const referenceKeyFieldASTNode = getReferenceKeyFieldASTNode(fieldNode, context);
    const parentDirectiveNode = findDirectiveWithName(fieldNode, PARENT_DIRECTIVE);
    const rootDirectiveNode = findDirectiveWithName(fieldNode, ROOT_DIRECTIVE);
    const flexSearchIndexCaseSensitiveNode = getFlexSearchIndexCaseSensitiveNode(
        fieldNode,
        context,
    );
    const accessFieldDirectiveASTNode = findDirectiveWithName(fieldNode, ACCESS_FIELD_DIRECTIVE);
    const hiddenDirectiveASTNode = findDirectiveWithName(fieldNode, HIDDEN_DIRECTIVE);

    return {
        name: fieldNode.name.value,
        description: fieldNode.description ? fieldNode.description.value : undefined,
        deprecationReason: getDeprecationReason(fieldNode),
        astNode: fieldNode,
        calcMutationOperators: getCalcMutationOperators(fieldNode, context),
        defaultValueASTNode: findDirectiveWithName(fieldNode, DEFAULT_VALUE_DIRECTIVE),
        defaultValue: getDefaultValue(fieldNode, context),
        inverseOfASTNode,
        inverseOfFieldName: inverseOfASTNode ? inverseOfASTNode.value : undefined,
        relationDeleteActionASTNode,
        relationDeleteAction:
            relationDeleteActionASTNode?.value.kind === 'EnumValue'
                ? (relationDeleteActionASTNode.value.value as RelationDeleteAction)
                : undefined,
        isList:
            fieldNode.type.kind === Kind.LIST_TYPE ||
            (fieldNode.type.kind === Kind.NON_NULL_TYPE &&
                fieldNode.type.type.kind === Kind.LIST_TYPE),
        isReference: !!referenceDirectiveASTNode,
        referenceAstNode: referenceDirectiveASTNode,
        referenceKeyField: referenceKeyFieldASTNode ? referenceKeyFieldASTNode.value : undefined,
        referenceKeyFieldASTNode,
        isRelation: !!relationAstNode,
        relationAstNode,
        parentDirectiveNode,
        isParentField: !!parentDirectiveNode,
        rootDirectiveNode,
        isRootField: !!rootDirectiveNode,
        permissions: getPermissions(fieldNode, context),
        typeName: getTypeNameIgnoringNonNullAndList(fieldNode.type),
        typeNameAST: getNamedTypeNodeIgnoringNonNullAndList(fieldNode.type).name,
        isFlexSearchIndexed: hasDirectiveWithName(fieldNode, FLEX_SEARCH_INDEXED_DIRECTIVE),
        flexSearchIndexCaseSensitiveASTNode: flexSearchIndexCaseSensitiveNode,
        isFlexSearchIndexCaseSensitive:
            flexSearchIndexCaseSensitiveNode?.value.kind === 'BooleanValue'
                ? flexSearchIndexCaseSensitiveNode.value.value
                : options.isFlexSearchIndexCaseSensitiveByDefault,
        isFlexSearchIndexedASTNode: findDirectiveWithName(fieldNode, FLEX_SEARCH_INDEXED_DIRECTIVE),
        isFlexSearchFulltextIndexed: hasDirectiveWithName(
            fieldNode,
            FLEX_SEARCH_FULLTEXT_INDEXED_DIRECTIVE,
        ),
        isFlexSearchFulltextIndexedASTNode: findDirectiveWithName(
            fieldNode,
            FLEX_SEARCH_FULLTEXT_INDEXED_DIRECTIVE,
        ),
        isIncludedInSearch: getIsIncludedInSearch(fieldNode, context),
        isFulltextIncludedInSearch: getIsFulltextIncludedInSearch(fieldNode, context),
        flexSearchLanguage: getLanguage(fieldNode, context),
        collect: getCollectConfig(fieldNode, context),
        isAccessField: !!accessFieldDirectiveASTNode,
        accessFieldDirectiveASTNode,
        isHidden: !!hiddenDirectiveASTNode,
        isHiddenASTNode: hiddenDirectiveASTNode,
        moduleSpecification: getFieldModuleSpecification(fieldNode, context, options),
    };
}

function getCalcMutationOperators(
    fieldNode: FieldDefinitionNode,
    context: ValidationContext,
): ReadonlyArray<CalcMutationsOperator> {
    const calcMutationsDirective = findDirectiveWithName(fieldNode, CALC_MUTATIONS_DIRECTIVE);
    if (!calcMutationsDirective) {
        return [];
    }
    const calcMutationsArg = getNodeByName(
        calcMutationsDirective.arguments,
        CALC_MUTATIONS_OPERATORS_ARG,
    );
    if (!calcMutationsArg) {
        context.addMessage(
            ValidationMessage.error(
                VALIDATION_ERROR_MISSING_ARGUMENT_OPERATORS,
                calcMutationsDirective.loc,
            ),
        );
        return [];
    }
    if (calcMutationsArg.value.kind === Kind.ENUM) {
        return [calcMutationsArg.value.value as CalcMutationsOperator];
    } else if (calcMutationsArg.value.kind === Kind.LIST) {
        return compact(
            calcMutationsArg.value.values.map((val) => {
                if (val.kind !== Kind.ENUM) {
                    context.addMessage(
                        ValidationMessage.error(
                            VALIDATION_ERROR_EXPECTED_ENUM_OR_LIST_OF_ENUMS,
                            val.loc,
                        ),
                    );
                    return undefined;
                } else {
                    return val.value as CalcMutationsOperator;
                }
            }),
        );
    } else {
        context.addMessage(
            ValidationMessage.error(
                VALIDATION_ERROR_EXPECTED_ENUM_OR_LIST_OF_ENUMS,
                calcMutationsArg.value.loc,
            ),
        );
        return [];
    }
}

function createIndexDefinitionInputs(
    definition: ObjectTypeDefinitionNode,
    context: ValidationContext,
): ReadonlyArray<IndexDefinitionConfig> {
    return [
        ...createRootEntityBasedIndices(definition, context),
        ...createFieldBasedIndices(definition, context, false),
        ...createFieldBasedIndices(definition, context, true),
    ];
}

function createRootEntityBasedIndices(
    definition: ObjectTypeDefinitionNode,
    context: ValidationContext,
): ReadonlyArray<IndexDefinitionConfig> {
    const rootEntityDirective = findDirectiveWithName(definition, ROOT_ENTITY_DIRECTIVE);
    if (!rootEntityDirective) {
        return [];
    }
    const indicesArg = getNodeByName(rootEntityDirective.arguments, INDICES_ARG);
    if (!indicesArg) {
        return [];
    }
    if (indicesArg.value.kind === Kind.OBJECT) {
        return [buildIndexDefinitionFromObjectValue(indicesArg.value)];
    } else if (indicesArg.value.kind === Kind.LIST) {
        return compact(
            indicesArg.value.values.map((val) => {
                if (val.kind !== Kind.OBJECT) {
                    context.addMessage(
                        ValidationMessage.error(VALIDATION_ERROR_INVALID_ARGUMENT_TYPE, val.loc),
                    );
                    return undefined;
                }
                return buildIndexDefinitionFromObjectValue(val);
            }),
        );
    } else {
        context.addMessage(
            ValidationMessage.error(VALIDATION_ERROR_INVALID_ARGUMENT_TYPE, indicesArg.loc),
        );
        return [];
    }
}

function createFieldBasedIndices(
    definition: ObjectTypeDefinitionNode,
    context: ValidationContext,
    unique: boolean,
): ReadonlyArray<IndexDefinitionConfig> {
    return compact(
        (definition.fields || []).map((field): IndexDefinitionConfig | undefined => {
            let indexDirective = findDirectiveWithName(
                field,
                unique ? UNIQUE_DIRECTIVE : INDEX_DIRECTIVE,
            );
            if (!indexDirective) {
                return undefined;
            }
            let sparseArg =
                indexDirective.arguments &&
                indexDirective.arguments.find((arg) => arg.name.value === 'sparse');
            let sparse: boolean | undefined;
            if (sparseArg) {
                switch (sparseArg.value.kind) {
                    case 'BooleanValue':
                        sparse = sparseArg.value.value;
                        break;
                    case 'NullValue':
                        // leave at undefined
                        break;
                    default:
                        context.addMessage(
                            ValidationMessage.error(
                                `The value for the "sparse" argument should be either "true" or "false"`,
                                sparseArg.value,
                            ),
                        );
                }
            }
            return {
                astNode: indexDirective,
                fields: [field.name.value],
                unique,
                sparse,
                fieldASTNodes: [indexDirective],
            };
        }),
    );
}

function buildIndexDefinitionFromObjectValue(
    indexDefinitionNode: ObjectValueNode,
): IndexDefinitionConfig {
    return {
        ...mapIndexDefinition(indexDefinitionNode),
        astNode: indexDefinitionNode,
    };
}

function mapIndexDefinition(index: ObjectValueNode): IndexDefinitionConfig {
    const { id, name, ...value } = valueFromAST(index, indexDefinitionInputObjectType) as any;
    const fieldsField = index.fields.find((f) => f.name.value === 'fields');
    const fieldASTNodes =
        fieldsField && fieldsField.value.kind === 'ListValue'
            ? fieldsField.value.values
            : undefined;
    const nameASTNode = index.fields.find((f) => f.name.value === 'name');
    return {
        ...value,
        name,
        nameASTNode,
        fieldASTNodes,
    };
}

function getKindOfObjectTypeNode(
    definition: ObjectTypeDefinitionNode,
    context?: ValidationContext,
): string | undefined {
    const kindDirectives = (definition.directives || []).filter((dir) =>
        OBJECT_TYPE_KIND_DIRECTIVES.includes(dir.name.value),
    );
    if (kindDirectives.length !== 1) {
        if (context) {
            if (kindDirectives.length === 0) {
                context.addMessage(
                    ValidationMessage.error(
                        VALIDATION_ERROR_MISSING_OBJECT_TYPE_DIRECTIVE,
                        definition.name,
                    ),
                );
            } else {
                for (const directive of kindDirectives) {
                    context.addMessage(
                        ValidationMessage.error(
                            VALIDATION_ERROR_MULTIPLE_OBJECT_TYPE_DIRECTIVES,
                            directive,
                        ),
                    );
                }
            }
        }
        return undefined;
    }

    return kindDirectives[0].name.value;
}

function getNamespacePath(
    definition: TypeDefinitionNode,
    sourceNamespacePath: ReadonlyArray<string>,
): ReadonlyArray<string> {
    const directiveNamespace = findDirectiveWithName(definition, NAMESPACE_DIRECTIVE);
    if (!directiveNamespace || !directiveNamespace.arguments) {
        return sourceNamespacePath;
    }
    const directiveNamespaceArg = getNodeByName(directiveNamespace.arguments, NAMESPACE_NAME_ARG);
    return directiveNamespaceArg && directiveNamespaceArg.value.kind === Kind.STRING
        ? directiveNamespaceArg.value.value.split(NAMESPACE_SEPARATOR)
        : [];
}

function getKeyFieldASTNode(definition: ObjectTypeDefinitionNode, context: ValidationContext) {
    const keyFields = (definition.fields || []).filter((field) =>
        findDirectiveWithName(field, KEY_FIELD_DIRECTIVE),
    );
    if (keyFields.length == 0) {
        return undefined;
    }
    if (keyFields.length > 1) {
        keyFields.forEach((f) =>
            context.addMessage(
                ValidationMessage.error(
                    VALIDATION_ERROR_DUPLICATE_KEY_FIELD,
                    findDirectiveWithName(f, KEY_FIELD_DIRECTIVE),
                ),
            ),
        );
        return undefined;
    }
    return keyFields[0];
}

function getPermissions(
    node: ObjectTypeDefinitionNode | FieldDefinitionNode,
    context: ValidationContext,
): PermissionsConfig | undefined {
    const rootEntityDirective = findDirectiveWithName(node, ROOT_ENTITY_DIRECTIVE);
    const permissionProfileArg = rootEntityDirective
        ? getNodeByName(rootEntityDirective.arguments, PERMISSION_PROFILE_ARG)
        : undefined;
    const permissionProfileNameAstNode = getPermissionProfileAstNode(permissionProfileArg, context);
    const rolesDirective = findDirectiveWithName(node, ROLES_DIRECTIVE);
    if (!permissionProfileArg && !rolesDirective) {
        return undefined;
    }
    const roles: RolesSpecifierConfig | undefined = rolesDirective
        ? {
              read: getRolesOfArg(getNodeByName(rolesDirective.arguments, ROLES_READ_ARG), context),
              readWrite: getRolesOfArg(
                  getNodeByName(rolesDirective.arguments, ROLES_READ_WRITE_ARG),
                  context,
              ),
              astNode: rolesDirective,
          }
        : undefined;
    return {
        permissionProfileName: permissionProfileNameAstNode
            ? permissionProfileNameAstNode.value
            : undefined,
        permissionProfileNameAstNode,
        roles,
    };
}

function getRolesOfArg(rolesArg: ArgumentNode | undefined, context: ValidationContext) {
    if (!rolesArg) {
        return undefined;
    }
    let roles: ReadonlyArray<string> | undefined = undefined;
    if (rolesArg) {
        if (rolesArg.value.kind === Kind.LIST) {
            roles = compact(
                rolesArg.value.values.map((val) => {
                    if (val.kind !== Kind.STRING) {
                        context.addMessage(
                            ValidationMessage.error(
                                VALIDATION_ERROR_EXPECTED_STRING_OR_LIST_OF_STRINGS,
                                val.loc,
                            ),
                        );
                        return undefined;
                    } else {
                        return val.value;
                    }
                }),
            );
        } else if (rolesArg.value.kind === Kind.STRING) {
            roles = [rolesArg.value.value];
        } else {
            context.addMessage(
                ValidationMessage.error(
                    VALIDATION_ERROR_EXPECTED_STRING_OR_LIST_OF_STRINGS,
                    rolesArg.value.loc,
                ),
            );
        }
    }
    return roles;
}

function getPermissionProfileAstNode(
    permissionProfileArg: ArgumentNode | undefined,
    context: ValidationContext,
): StringValueNode | undefined {
    let permissionProfileNameAstNode = undefined;
    if (permissionProfileArg) {
        if (permissionProfileArg.value.kind !== Kind.STRING) {
            context.addMessage(
                ValidationMessage.error(
                    VALIDATION_ERROR_INVALID_PERMISSION_PROFILE,
                    permissionProfileArg.value.loc,
                ),
            );
        } else {
            permissionProfileNameAstNode = permissionProfileArg.value;
        }
    }
    return permissionProfileNameAstNode;
}

function getInverseOfASTNode(
    fieldNode: FieldDefinitionNode,
    context: ValidationContext,
): StringValueNode | undefined {
    const relationDirective = findDirectiveWithName(fieldNode, RELATION_DIRECTIVE);
    if (!relationDirective) {
        return undefined;
    }
    const inverseOfArg = getNodeByName(relationDirective.arguments, INVERSE_OF_ARG);
    if (!inverseOfArg) {
        return undefined;
    }
    if (inverseOfArg.value.kind !== Kind.STRING) {
        context.addMessage(
            ValidationMessage.error(
                VALIDATION_ERROR_INVERSE_OF_ARG_MUST_BE_STRING,
                inverseOfArg.value.loc,
            ),
        );
        return undefined;
    }
    return inverseOfArg.value;
}

function getRelationDeleteActionASTNode(
    fieldNode: FieldDefinitionNode,
    context: ValidationContext,
): ArgumentNode | undefined {
    const relationDirective = findDirectiveWithName(fieldNode, RELATION_DIRECTIVE);
    if (!relationDirective) {
        return undefined;
    }
    return getNodeByName(relationDirective.arguments, ON_DELETE_ARG);
}

function getReferenceKeyFieldASTNode(
    fieldNode: FieldDefinitionNode,
    context: ValidationContext,
): StringValueNode | undefined {
    const relationDirective = findDirectiveWithName(fieldNode, REFERENCE_DIRECTIVE);
    if (!relationDirective) {
        return undefined;
    }
    const keyFieldArg = getNodeByName(relationDirective.arguments, KEY_FIELD_ARG);
    if (!keyFieldArg) {
        return undefined;
    }
    if (keyFieldArg.value.kind !== Kind.STRING) {
        // should be caught by the graphql validator anyway...
        context.addMessage(
            ValidationMessage.error(
                `The argument "${KEY_FIELD_ARG}" must be of type String`,
                keyFieldArg.value.loc,
            ),
        );
        return undefined;
    }
    return keyFieldArg.value;
}

function getCollectConfig(
    fieldNode: FieldDefinitionNode,
    context: ValidationContext,
): CollectFieldConfig | undefined {
    const directive = findDirectiveWithName(fieldNode, COLLECT_DIRECTIVE);
    if (!directive) {
        return undefined;
    }
    const pathArg = getNodeByName(directive.arguments, COLLECT_PATH_ARG);
    if (!pathArg) {
        context.addMessage(
            ValidationMessage.error(`Argument "${COLLECT_PATH_ARG}" is missing`, directive.loc),
        );
        return undefined;
    }
    if (pathArg.value.kind !== Kind.STRING) {
        // should be caught by the graphql validator anyway...
        context.addMessage(
            ValidationMessage.error(
                `The argument "${COLLECT_PATH_ARG}" must be of type String`,
                pathArg.value.loc,
            ),
        );
        return undefined;
    }
    const aggregateArg = getNodeByName(directive.arguments, COLLECT_AGGREGATE_ARG);
    const aggregateValueNode = aggregateArg && aggregateArg.value;
    if (aggregateValueNode && aggregateValueNode.kind !== 'EnumValue') {
        // should be caught by the graphql validator anyway...
        context.addMessage(
            ValidationMessage.error(
                `The argument "${COLLECT_AGGREGATE_ARG}" must be an enum value`,
                pathArg.value.loc,
            ),
        );
        return undefined;
    }
    return {
        astNode: directive,
        path: pathArg.value.value,
        pathASTNode: pathArg.value,
        aggregationOperator:
            aggregateValueNode && (aggregateValueNode.value as AggregationOperator),
        aggregationOperatorASTNode: aggregateValueNode,
    };
}

function extractPermissionProfiles(
    parsedProject: ParsedProject,
): ReadonlyArray<NamespacedPermissionProfileConfigMap> {
    return compact(
        parsedProject.sources.map((source): NamespacedPermissionProfileConfigMap | undefined => {
            if (source.kind !== ParsedProjectSourceBaseKind.OBJECT) {
                return undefined;
            }
            if (!source.object.permissionProfiles) {
                return undefined;
            }
            const profilesWithoutLocs = source.object
                .permissionProfiles as PermissionProfileConfigMap;
            const profiles: PermissionProfileConfigMap = mapValues(
                profilesWithoutLocs,
                (profile, name) => ({
                    ...profile,
                    permissions: profile.permissions?.map((permission, permissionIndex) => ({
                        ...permission,
                        restrictions: permission.restrictions?.map(
                            (restriction, restrictionIndex) => ({
                                ...restriction,
                                fieldValueLoc:
                                    source.pathLocationMap[
                                        `/permissionProfiles/${name}/permissions/${permissionIndex}/restrictions/${restrictionIndex}/field`
                                    ],
                                loc: source.pathLocationMap[
                                    `/permissionProfiles/${name}/permissions/${permissionIndex}/restrictions/${restrictionIndex}`
                                ],
                            }),
                        ),
                        loc: source.pathLocationMap[
                            `/permissionProfiles/${name}/permissions/${permissionIndex}`
                        ],
                    })),
                    loc: source.pathLocationMap[`/permissionProfiles/${name}`],
                }),
            );
            return {
                namespacePath: source.namespacePath,
                profiles,
            };
        }),
    );
}

function extractI18n(parsedProject: ParsedProject): ReadonlyArray<LocalizationConfig> {
    const objectSchemaParts = parsedProject.sources.filter(
        (parsedSource) => parsedSource.kind === ParsedProjectSourceBaseKind.OBJECT,
    ) as ReadonlyArray<ParsedObjectProjectSource>;
    return flatMap(objectSchemaParts, (source) => parseI18nConfigs(source));
}

function extractBilling(parsedProject: ParsedProject): BillingConfig {
    const objectSchemaParts = parsedProject.sources.filter(
        (parsedSource) => parsedSource.kind === ParsedProjectSourceBaseKind.OBJECT,
    ) as ReadonlyArray<ParsedObjectProjectSource>;
    return objectSchemaParts
        .map((source) => parseBillingConfigs(source))
        .reduce(
            (previousValue, currentValue) => {
                return {
                    ...previousValue,
                    billingEntities: [
                        ...currentValue.billingEntities,
                        ...previousValue.billingEntities,
                    ],
                };
            },
            { billingEntities: [] },
        );
}

function extractTimeToLive(parsedProject: ParsedProject): ReadonlyArray<TimeToLiveConfig> {
    const objectSchemaParts = parsedProject.sources.filter(
        (parsedSource) => parsedSource.kind === ParsedProjectSourceBaseKind.OBJECT,
    ) as ReadonlyArray<ParsedObjectProjectSource>;
    return objectSchemaParts
        .map((source) => parseTTLConfigs(source))
        .reduce((previousValue, currentValue) => previousValue.concat(currentValue), []);
}

function extractModules(
    parsedProject: ParsedProject,
    options: ModelOptions,
    validationContext: ValidationContext,
): ReadonlyArray<ModuleConfig> {
    const objectSchemaParts = parsedProject.sources.filter(
        (parsedSource) => parsedSource.kind === ParsedProjectSourceBaseKind.OBJECT,
    ) as ReadonlyArray<ParsedObjectProjectSource>;
    return objectSchemaParts
        .map((source) => parseModuleConfigs(source, options, validationContext))
        .reduce((previousValue, currentValue) => previousValue.concat(currentValue), []);
}

// fake input type for index mapping
const indexDefinitionInputObjectType: GraphQLInputObjectType = new GraphQLInputObjectType({
    fields: {
        id: { type: GraphQLString },
        fields: { type: new GraphQLNonNull(new GraphQLList(GraphQLString)) },
        unique: { type: GraphQLBoolean, defaultValue: false },
        sparse: { type: GraphQLBoolean },
    },
    name: INDEX_DEFINITION_INPUT_TYPE,
});

const flexSearchOrderInputObjectType: GraphQLInputObjectType = new GraphQLInputObjectType({
    name: 'FlexSearchOrderArgument',
    fields: {
        field: { type: GraphQLString },
        direction: {
            type: new GraphQLEnumType({
                name: 'OrderDirection',
                values: { ASC: { value: 'ASC' }, DESC: { value: 'DESC' } },
            }),
        },
    },
});

function getCombinedModuleSpecification(
    definition: ObjectTypeDefinitionNode | EnumTypeDefinitionNode | FieldDefinitionNode,
    context: ValidationContext,
    options: ModelOptions,
): (TypeModuleSpecificationConfig & FieldModuleSpecificationConfig) | undefined {
    const astNode = findDirectiveWithName(definition, MODULES_DIRECTIVE);
    if (!astNode) {
        return undefined;
    }

    if (!options.withModuleDefinitions) {
        context.addMessage(
            ValidationMessage.error(
                `Module specifications are not supported in this context.`,
                astNode,
            ),
        );
        return undefined;
    }

    const inAstNode = astNode.arguments?.find((a) => a.name.value === MODULES_IN_ARG);
    let allAstNode = astNode.arguments?.find((a) => a.name.value === MODULES_ALL_ARG);
    let includeAllFieldsAstNode = astNode.arguments?.find(
        (a) => a.name.value === MODULES_INCLUDE_ALL_FIELDS_ARG,
    );

    // graphql allows you to omit the [] on lists...
    const inNodes =
        inAstNode?.value.kind === Kind.STRING
            ? [inAstNode.value]
            : inAstNode?.value.kind === Kind.LIST
            ? inAstNode.value.values
            : undefined;

    const config: TypeModuleSpecificationConfig & FieldModuleSpecificationConfig = {
        astNode,
        inAstNode,
        allAstNode,
        includeAllFieldsAstNode,

        in: inNodes?.map((astNode) => ({
            astNode,
            expression: astNode.kind === Kind.STRING ? astNode.value : '',
        })),
        all: allAstNode?.value?.kind === Kind.BOOLEAN ? allAstNode.value.value : false,
        includeAllFields:
            includeAllFieldsAstNode?.value?.kind === Kind.BOOLEAN
                ? includeAllFieldsAstNode.value.value
                : false,
    };
    return config;
}

function getTypeModuleSpecification(
    definition: ObjectTypeDefinitionNode | EnumTypeDefinitionNode,
    context: ValidationContext,
    options: ModelOptions,
): TypeModuleSpecificationConfig | undefined {
    const config = getCombinedModuleSpecification(definition, context, options);
    if (!config) {
        return config;
    }

    if (config.allAstNode) {
        context.addMessage(
            ValidationMessage.error(
                `"${MODULES_ALL_ARG}" can only be specified on field declarations.`,
                config.allAstNode,
            ),
        );
    }

    return config;
}

function getFieldModuleSpecification(
    definition: FieldDefinitionNode,
    context: ValidationContext,
    options: ModelOptions,
): FieldModuleSpecificationConfig | undefined {
    const config = getCombinedModuleSpecification(definition, context, options);
    if (!config) {
        return config;
    }

    if (config.includeAllFieldsAstNode) {
        context.addMessage(
            ValidationMessage.error(
                `"${MODULES_INCLUDE_ALL_FIELDS_ARG}" can only be specified on type declarations.`,
                config.includeAllFieldsAstNode,
            ),
        );
    }

    return config;
}
