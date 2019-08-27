import { ArgumentNode, DirectiveNode, EnumValueDefinitionNode, FieldDefinitionNode, GraphQLBoolean, GraphQLEnumType, GraphQLID, GraphQLInputObjectType, GraphQLList, GraphQLNonNull, GraphQLString, ObjectTypeDefinitionNode, ObjectValueNode, StringValueNode, TypeDefinitionNode, valueFromAST } from 'graphql';
import { ParsedGraphQLProjectSource, ParsedObjectProjectSource, ParsedProject, ParsedProjectSourceBaseKind } from '../config/parsed-project';
import { ArangoSearchPrimarySortConfig } from '../database/arangodb/schema-migration/arango-search-helpers';
import { ENUM, ENUM_TYPE_DEFINITION, LIST, LIST_TYPE, NON_NULL_TYPE, OBJECT, OBJECT_TYPE_DEFINITION, STRING } from '../graphql/kinds';
import { getValueFromAST } from '../graphql/value-from-ast';
import { CALC_MUTATIONS_DIRECTIVE, CALC_MUTATIONS_OPERATORS_ARG, CHILD_ENTITY_DIRECTIVE, COLLECT_AGGREGATE_ARG, COLLECT_DIRECTIVE, COLLECT_PATH_ARG, DEFAULT_VALUE_DIRECTIVE, ENTITY_EXTENSION_DIRECTIVE, FLEX_SEARCH_DEFAULT_LANGUAGE_ARG, FLEX_SEARCH_FULLTEXT_INDEXED_DIRECTIVE, FLEX_SEARCH_INCLUDED_IN_SEARCH_ARGUMENT, FLEX_SEARCH_INDEXED_ARGUMENT, FLEX_SEARCH_INDEXED_DIRECTIVE, FLEX_SEARCH_INDEXED_LANGUAGE_ARG, FLEX_SEARCH_ORDER_ARGUMENT, ID_FIELD, INDEX_DEFINITION_INPUT_TYPE, INDEX_DIRECTIVE, INDICES_ARG, INVERSE_OF_ARG, KEY_FIELD_ARG, KEY_FIELD_DIRECTIVE, NAMESPACE_DIRECTIVE, NAMESPACE_NAME_ARG, NAMESPACE_SEPARATOR, OBJECT_TYPE_KIND_DIRECTIVES, PERMISSION_PROFILE_ARG, REFERENCE_DIRECTIVE, RELATION_DIRECTIVE, ROLES_DIRECTIVE, ROLES_READ_ARG, ROLES_READ_WRITE_ARG, ROOT_ENTITY_DIRECTIVE, UNIQUE_DIRECTIVE, VALUE_ARG, VALUE_OBJECT_DIRECTIVE } from '../schema/constants';
import { findDirectiveWithName, getNamedTypeNodeIgnoringNonNullAndList, getNodeByName, getTypeNameIgnoringNonNullAndList, hasDirectiveWithName } from '../schema/schema-utils';
import { compact, flatMap, mapValues } from '../utils/utils';
import { AggregationOperator, ArangoSearchIndexConfig, CalcMutationsOperator, CollectFieldConfig, EnumTypeConfig, EnumValueConfig, FieldConfig, FlexSearchLanguage, IndexDefinitionConfig, LocalizationConfig, NamespacedPermissionProfileConfigMap, ObjectTypeConfig, PermissionProfileConfigMap, PermissionsConfig, RolesSpecifierConfig, TypeConfig, TypeKind } from './config';
import { Model } from './implementation';
import { parseI18nConfigs } from './parse-i18n';
import { ValidationContext, ValidationMessage } from './validation';

export function createModel(parsedProject: ParsedProject): Model {
    const validationContext = new ValidationContext();
    return new Model({
        types: createTypeInputs(parsedProject, validationContext),
        permissionProfiles: extractPermissionProfiles(parsedProject),
        i18n: extractI18n(parsedProject),
        validationMessages: validationContext.validationMessages
    });
}

const VALIDATION_ERROR_INVALID_PERMISSION_PROFILE = `Invalid argument value, expected string`;
const VALIDATION_ERROR_EXPECTED_STRING_OR_LIST_OF_STRINGS = 'Expected string or list of strings';
const VALIDATION_ERROR_EXPECTED_BOOLEAN = 'Expected boolean';
const VALIDATION_ERROR_EXPECTED_ENUM_OR_LIST_OF_ENUMS = 'Expected enum or list of enums';
const VALIDATION_ERROR_EXPECTED_ENUM = 'Expected enum';
const VALIDATION_ERROR_INVERSE_OF_ARG_MUST_BE_STRING = 'inverseOf must be specified as String';
const VALIDATION_ERROR_MISSING_ARGUMENT_OPERATORS = 'Missing argument \'operators\'';
const VALIDATION_ERROR_MISSING_ARGUMENT_DEFAULT_VALUE = DEFAULT_VALUE_DIRECTIVE + ' needs an argument named ' + VALUE_ARG;
const VALIDATION_ERROR_INVALID_ARGUMENT_TYPE = 'Invalid argument type.';
const VALIDATION_ERROR_DUPLICATE_KEY_FIELD = 'Only one field can be a @key field.';
const VALIDATION_ERROR_MULTIPLE_OBJECT_TYPE_DIRECTIVES = `Only one of @${ROOT_ENTITY_DIRECTIVE}, @${CHILD_ENTITY_DIRECTIVE}, @${ENTITY_EXTENSION_DIRECTIVE} or @${VALUE_OBJECT_DIRECTIVE} can be used.`;
const VALIDATION_ERROR_MISSING_OBJECT_TYPE_DIRECTIVE = `Add one of @${ROOT_ENTITY_DIRECTIVE}, @${CHILD_ENTITY_DIRECTIVE}, @${ENTITY_EXTENSION_DIRECTIVE} or @${VALUE_OBJECT_DIRECTIVE}.`;
const VALIDATION_ERROR_INVALID_DEFINITION_KIND = 'This kind of definition is not allowed. Only object and enum type definitions are allowed.';

function createTypeInputs(parsedProject: ParsedProject, context: ValidationContext): ReadonlyArray<TypeConfig> {
    const graphQLSchemaParts = parsedProject.sources.filter(parsedSource => parsedSource.kind === ParsedProjectSourceBaseKind.GRAPHQL) as ReadonlyArray<ParsedGraphQLProjectSource>;
    return flatMap(graphQLSchemaParts, (schemaPart => compact(schemaPart.document.definitions.map(definition => {
        // Only look at object types and enums (scalars are not supported yet, they need to be implemented somehow, e.g. via regex check)
        if (definition.kind != OBJECT_TYPE_DEFINITION && definition.kind !== ENUM_TYPE_DEFINITION) {
            context.addMessage(ValidationMessage.error(VALIDATION_ERROR_INVALID_DEFINITION_KIND, definition));
            return undefined;
        }

        const common = {
            description: definition.description ? definition.description.value : undefined,
            name: definition.name.value
        };

        switch (definition.kind) {
            case ENUM_TYPE_DEFINITION:
                const enumTypeInput: EnumTypeConfig = {
                    ...common,
                    namespacePath: getNamespacePath(definition, schemaPart.namespacePath),
                    astNode: definition,
                    kind: TypeKind.ENUM,
                    values: createEnumValues(definition.values || [])
                };
                return enumTypeInput;
            case OBJECT_TYPE_DEFINITION:
                return createObjectTypeInput(definition, schemaPart, context);
            default:
                return undefined;
        }

    }))));
}

function createEnumValues(valueNodes: ReadonlyArray<EnumValueDefinitionNode>): ReadonlyArray<EnumValueConfig> {
    return valueNodes.map((valNode): EnumValueConfig => ({
        value: valNode.name.value,
        description: valNode.description && valNode.description.value,
        astNode: valNode
    }));
}

function createObjectTypeInput(definition: ObjectTypeDefinitionNode, schemaPart: ParsedGraphQLProjectSource, context: ValidationContext): ObjectTypeConfig {
    const entityType = getKindOfObjectTypeNode(definition, context);

    const common = {
        name: definition.name.value,
        description: definition.description ? definition.description.value : undefined,
        astNode: definition,
        fields: (definition.fields || []).map(field => createFieldInput(field, context)),
        namespacePath: getNamespacePath(definition, schemaPart.namespacePath),
        flexSearchLanguage: getDefaultLanguage(definition, context)
    };

    switch (entityType) {
        case CHILD_ENTITY_DIRECTIVE:
            return {
                kind: TypeKind.CHILD_ENTITY,
                ...common
            };
        case ENTITY_EXTENSION_DIRECTIVE:
            return {
                kind: TypeKind.ENTITY_EXTENSION,
                ...common
            };
        case VALUE_OBJECT_DIRECTIVE:
            return {
                kind: TypeKind.VALUE_OBJECT,
                ...common
            };
        default:
            // interpret unknown kinds as root entity because they are least likely to cause unnecessary errors
            // (errors are already reported in getKindOfObjectTypeNode)

            const rootEntityDirective = findDirectiveWithName(definition, ROOT_ENTITY_DIRECTIVE);
            return {
                ...common,
                ...processKeyField(definition, common.fields, context),
                kind: TypeKind.ROOT_ENTITY,
                permissions: getPermissions(definition, context),
                indices: createIndexDefinitionInputs(definition, context),
                arangoSearchIndex: createArangoSearchDefinitionInputs(definition, context),
                flexSearchOrderASTNode: rootEntityDirective ? getNodeByName(rootEntityDirective.arguments, FLEX_SEARCH_ORDER_ARGUMENT) : undefined
            };
    }
}

/**
 * Extract the @key field
 *
 * id: ID @key means that 'id' is the @key field
 * for backwards compatibility, we also support _key: String @key
 */
function processKeyField(definition: ObjectTypeDefinitionNode, fields: ReadonlyArray<FieldConfig>, context: ValidationContext) {
    let keyFieldASTNode: FieldDefinitionNode | undefined = getKeyFieldASTNode(definition, context);
    let keyFieldName: string | undefined = keyFieldASTNode ? keyFieldASTNode.name.value : undefined;
    const underscoreKeyField = fields.find(field => field.name == '_key');
    if (underscoreKeyField) {
        fields = fields.filter(f => f !== underscoreKeyField);
        if (keyFieldASTNode && keyFieldASTNode.name.value === underscoreKeyField.name) {
            keyFieldASTNode = underscoreKeyField.astNode;
            keyFieldName = ID_FIELD;
            context.addMessage(ValidationMessage.warn(`The field "_key" is deprecated and should be replaced with "id" (of type "ID").`, underscoreKeyField.astNode));
        } else {
            context.addMessage(ValidationMessage.error(`The field name "_key" is reserved and can only be used in combination with @key.`, underscoreKeyField.astNode));
        }
    }
    const idField = fields.find(field => field.name == ID_FIELD);
    if (idField) {
        fields = fields.filter(f => f !== idField);
        if (keyFieldASTNode && keyFieldASTNode.name.value === idField.name) {
            keyFieldASTNode = idField.astNode;
            keyFieldName = ID_FIELD;
        } else {
            context.addMessage(ValidationMessage.warn(`The field "id" is redundant and should only be explicitly added when used with @key.`, idField.astNode));
        }
        if (idField.typeName !== GraphQLID.name || idField.isList) {
            context.addMessage(ValidationMessage.error(`The field "id" must be of type "ID".`, idField.astNode));
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
        context.addMessage(ValidationMessage.error(VALIDATION_ERROR_MISSING_ARGUMENT_DEFAULT_VALUE, defaultValueDirective));
        return undefined;
    }
    return getValueFromAST(defaultValueArg.value);
}

function getFlexSearchOrder(rootEntityDirective?: DirectiveNode): ArangoSearchPrimarySortConfig[] {
    if (!rootEntityDirective) {
        return [];
    }
    const argumentFlexSearchOrder: ArgumentNode | undefined = getNodeByName(rootEntityDirective.arguments, FLEX_SEARCH_ORDER_ARGUMENT);
    if (argumentFlexSearchOrder && argumentFlexSearchOrder.value.kind === 'ListValue') {
        return argumentFlexSearchOrder.value.values.map(orderArgument => {
            return valueFromAST(orderArgument, flexSearchOrderInputObjectType);
        }).map((value: any) => {
            return {
                field: value.field,
                direction: value.direction === 'ASC' ? 'asc' : 'desc'
            };
        });


    }
    return [];
}

function createArangoSearchDefinitionInputs(objectNode: ObjectTypeDefinitionNode, context: ValidationContext): ArangoSearchIndexConfig {
    let directive = findDirectiveWithName(objectNode, ROOT_ENTITY_DIRECTIVE);
    let config = {
        isIndexed: false,
        directiveASTNode: directive,
        primarySort: getFlexSearchOrder(directive)
    };
    if (directive) {
        const argumentIndexed: ArgumentNode | undefined = getNodeByName(directive.arguments, FLEX_SEARCH_INDEXED_ARGUMENT);
        if (argumentIndexed) {
            if (argumentIndexed.value.kind === 'BooleanValue') {
                config.isIndexed = argumentIndexed.value.value;
            }
        }
    }
    return config;


}

function getIsIncludedInSearch(fieldNode: FieldDefinitionNode, context: ValidationContext): boolean {
    const directive = findDirectiveWithName(fieldNode, FLEX_SEARCH_INDEXED_DIRECTIVE);
    if (directive) {
        const argument = getNodeByName(directive.arguments, FLEX_SEARCH_INCLUDED_IN_SEARCH_ARGUMENT);
        if (argument) {
            if (argument.value.kind === 'BooleanValue') {
                return argument.value.value;
            } else {
                context.addMessage(ValidationMessage.error(VALIDATION_ERROR_EXPECTED_BOOLEAN, argument.value.loc));
            }
        }
    }
    return false;
}

function getIsFulltextIncludedInSearch(fieldNode: FieldDefinitionNode, context: ValidationContext): boolean {
    const directive = findDirectiveWithName(fieldNode, FLEX_SEARCH_FULLTEXT_INDEXED_DIRECTIVE);
    if (directive) {
        const argument = getNodeByName(directive.arguments, FLEX_SEARCH_INCLUDED_IN_SEARCH_ARGUMENT);
        if (argument) {
            if (argument.value.kind === 'BooleanValue') {
                return argument.value.value;
            } else {
                context.addMessage(ValidationMessage.error(VALIDATION_ERROR_EXPECTED_BOOLEAN, argument.value.loc));
            }
        }
    }
    return false;
}

function getDefaultLanguage(objectTypeDefinitionNode: ObjectTypeDefinitionNode, context: ValidationContext): FlexSearchLanguage | undefined {
    let directive: DirectiveNode | undefined =
        findDirectiveWithName(objectTypeDefinitionNode, ROOT_ENTITY_DIRECTIVE)
        || findDirectiveWithName(objectTypeDefinitionNode, CHILD_ENTITY_DIRECTIVE)
        || findDirectiveWithName(objectTypeDefinitionNode, VALUE_OBJECT_DIRECTIVE)
        || findDirectiveWithName(objectTypeDefinitionNode, ENTITY_EXTENSION_DIRECTIVE);
    if (!directive) {
        return undefined;
    }
    const argument: ArgumentNode | undefined = getNodeByName(directive.arguments, FLEX_SEARCH_DEFAULT_LANGUAGE_ARG);
    if (!argument) {
        return undefined;
    }

    if (argument.value.kind === 'EnumValue') {
        return argument.value.value as FlexSearchLanguage;
    } else {
        context.addMessage(ValidationMessage.error(VALIDATION_ERROR_EXPECTED_ENUM, argument.value.loc));
        return undefined;
    }
}

function getLanguage(fieldNode: FieldDefinitionNode, context: ValidationContext): FlexSearchLanguage | undefined {

    let directive: DirectiveNode | undefined = findDirectiveWithName(fieldNode, FLEX_SEARCH_FULLTEXT_INDEXED_DIRECTIVE);
    if (!directive) {
        return undefined;
    }
    const argument: ArgumentNode | undefined = getNodeByName(directive.arguments, FLEX_SEARCH_INDEXED_LANGUAGE_ARG);
    if (!argument) {
        return undefined;
    }

    if (argument.value.kind === 'EnumValue') {
        return argument.value.value as FlexSearchLanguage;
    } else {
        context.addMessage(ValidationMessage.error(VALIDATION_ERROR_EXPECTED_ENUM, argument.value.loc));
        return undefined;
    }
}

function createFieldInput(fieldNode: FieldDefinitionNode, context: ValidationContext): FieldConfig {
    const inverseOfASTNode = getInverseOfASTNode(fieldNode, context);
    const referenceDirectiveASTNode = findDirectiveWithName(fieldNode, REFERENCE_DIRECTIVE);
    const referenceKeyFieldASTNode = getReferenceKeyFieldASTNode(fieldNode, context);

    return {
        name: fieldNode.name.value,
        description: fieldNode.description ? fieldNode.description.value : undefined,
        astNode: fieldNode,
        calcMutationOperators: getCalcMutationOperators(fieldNode, context),
        defaultValueASTNode: findDirectiveWithName(fieldNode, DEFAULT_VALUE_DIRECTIVE),
        defaultValue: getDefaultValue(fieldNode, context),
        inverseOfASTNode,
        inverseOfFieldName: inverseOfASTNode ? inverseOfASTNode.value : undefined,
        isList: fieldNode.type.kind === LIST_TYPE || (fieldNode.type.kind === NON_NULL_TYPE && fieldNode.type.type.kind === LIST_TYPE),
        isReference: !!referenceDirectiveASTNode,
        referenceKeyField: referenceKeyFieldASTNode ? referenceKeyFieldASTNode.value : undefined,
        referenceKeyFieldASTNode,
        isRelation: !!findDirectiveWithName(fieldNode, RELATION_DIRECTIVE),
        permissions: getPermissions(fieldNode, context),
        typeName: getTypeNameIgnoringNonNullAndList(fieldNode.type),
        typeNameAST: getNamedTypeNodeIgnoringNonNullAndList(fieldNode.type).name,
        isFlexSearchIndexed: hasDirectiveWithName(fieldNode, FLEX_SEARCH_INDEXED_DIRECTIVE),
        isFlexSearchIndexedASTNode: findDirectiveWithName(fieldNode, FLEX_SEARCH_INDEXED_DIRECTIVE),
        isFlexSearchFulltextIndexed: hasDirectiveWithName(fieldNode, FLEX_SEARCH_FULLTEXT_INDEXED_DIRECTIVE),
        isFlexSearchFulltextIndexedASTNode: findDirectiveWithName(fieldNode, FLEX_SEARCH_FULLTEXT_INDEXED_DIRECTIVE),
        isIncludedInSearch: getIsIncludedInSearch(fieldNode, context),
        isFulltextIncludedInSearch: getIsFulltextIncludedInSearch(fieldNode, context),
        flexSearchLanguage: getLanguage(fieldNode, context),
        collect: getCollectConfig(fieldNode, context)
    };
}

function getCalcMutationOperators(fieldNode: FieldDefinitionNode, context: ValidationContext): ReadonlyArray<CalcMutationsOperator> {
    const calcMutationsDirective = findDirectiveWithName(fieldNode, CALC_MUTATIONS_DIRECTIVE);
    if (!calcMutationsDirective) {
        return [];
    }
    const calcMutationsArg = getNodeByName(calcMutationsDirective.arguments, CALC_MUTATIONS_OPERATORS_ARG);
    if (!calcMutationsArg) {
        context.addMessage(ValidationMessage.error(VALIDATION_ERROR_MISSING_ARGUMENT_OPERATORS, calcMutationsDirective.loc));
        return [];
    }
    if (calcMutationsArg.value.kind === ENUM) {
        return [calcMutationsArg.value.value as CalcMutationsOperator];
    } else if (calcMutationsArg.value.kind === LIST) {
        return compact(calcMutationsArg.value.values.map(val => {
            if (val.kind !== ENUM) {
                context.addMessage(ValidationMessage.error(VALIDATION_ERROR_EXPECTED_ENUM_OR_LIST_OF_ENUMS, val.loc));
                return undefined;
            } else {
                return val.value as CalcMutationsOperator;
            }
        }));
    } else {
        context.addMessage(ValidationMessage.error(VALIDATION_ERROR_EXPECTED_ENUM_OR_LIST_OF_ENUMS, calcMutationsArg.value.loc));
        return [];
    }
}

function createIndexDefinitionInputs(definition: ObjectTypeDefinitionNode, context: ValidationContext): ReadonlyArray<IndexDefinitionConfig> {
    return [
        ...createRootEntityBasedIndices(definition, context),
        ...createFieldBasedIndices(definition, context)
    ];
}

function createRootEntityBasedIndices(definition: ObjectTypeDefinitionNode, context: ValidationContext): ReadonlyArray<IndexDefinitionConfig> {
    const rootEntityDirective = findDirectiveWithName(definition, ROOT_ENTITY_DIRECTIVE);
    if (!rootEntityDirective) {
        return [];
    }
    const indicesArg = getNodeByName(rootEntityDirective.arguments, INDICES_ARG);
    if (!indicesArg) {
        return [];
    }
    if (indicesArg.value.kind === OBJECT) {
        return [buildIndexDefinitionFromObjectValue(indicesArg.value)];
    } else if (indicesArg.value.kind === LIST) {
        return compact(indicesArg.value.values.map(val => {
            if (val.kind !== OBJECT) {
                context.addMessage(ValidationMessage.error(VALIDATION_ERROR_INVALID_ARGUMENT_TYPE, val.loc));
                return undefined;
            }
            return buildIndexDefinitionFromObjectValue(val);
        }));
    } else {
        context.addMessage(ValidationMessage.error(VALIDATION_ERROR_INVALID_ARGUMENT_TYPE, indicesArg.loc));
        return [];
    }
}

function createFieldBasedIndices(definition: ObjectTypeDefinitionNode, context: ValidationContext): ReadonlyArray<IndexDefinitionConfig> {
    return compact((definition.fields || []).map((field): IndexDefinitionConfig | undefined => {
        let unique = false;
        let indexDirective = findDirectiveWithName(field, INDEX_DIRECTIVE);
        if (!indexDirective) {
            indexDirective = findDirectiveWithName(field, UNIQUE_DIRECTIVE);
            unique = !!indexDirective;
        }
        if (!indexDirective) {
            return undefined;
        }
        let sparseArg = indexDirective.arguments && indexDirective.arguments.find(arg => arg.name.value === 'sparse');
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
                    context.addMessage(ValidationMessage.error(`The value for the "sparse" argument should be either "true" or "false"`, sparseArg.value));
            }
        }
        return {
            astNode: indexDirective,
            fields: [field.name.value],
            unique,
            sparse,
            fieldASTNodes: [indexDirective]
        };
    }));
}

function buildIndexDefinitionFromObjectValue(indexDefinitionNode: ObjectValueNode): IndexDefinitionConfig {
    return {
        ...mapIndexDefinition(indexDefinitionNode),
        astNode: indexDefinitionNode
    };
}

function mapIndexDefinition(index: ObjectValueNode): IndexDefinitionConfig {
    const value = valueFromAST(index, indexDefinitionInputObjectType);
    const fieldsField = index.fields.find(f => f.name.value === 'fields');
    const fieldASTNodes = fieldsField && fieldsField.value.kind === 'ListValue' ? fieldsField.value.values : undefined;
    return {
        ...value,
        fieldASTNodes
    };
}

function getKindOfObjectTypeNode(definition: ObjectTypeDefinitionNode, context?: ValidationContext): string | undefined {
    const kindDirectives = (definition.directives || []).filter(dir => OBJECT_TYPE_KIND_DIRECTIVES.includes(dir.name.value));
    if (kindDirectives.length !== 1) {
        if (context) {
            if (kindDirectives.length === 0) {
                context.addMessage(ValidationMessage.error(VALIDATION_ERROR_MISSING_OBJECT_TYPE_DIRECTIVE, definition.name));
            } else {
                for (const directive of kindDirectives) {
                    context.addMessage(ValidationMessage.error(VALIDATION_ERROR_MULTIPLE_OBJECT_TYPE_DIRECTIVES, directive));
                }
            }
        }
        return undefined;
    }

    return kindDirectives[0].name.value;
}

function getNamespacePath(definition: TypeDefinitionNode, sourceNamespacePath: ReadonlyArray<string>): ReadonlyArray<string> {
    const directiveNamespace = findDirectiveWithName(definition, NAMESPACE_DIRECTIVE);
    if (!directiveNamespace || !directiveNamespace.arguments) {
        return sourceNamespacePath;
    }
    const directiveNamespaceArg = getNodeByName(directiveNamespace.arguments, NAMESPACE_NAME_ARG);
    return directiveNamespaceArg && directiveNamespaceArg.value.kind === STRING ? directiveNamespaceArg.value.value.split(NAMESPACE_SEPARATOR) : [];
}

function getKeyFieldASTNode(definition: ObjectTypeDefinitionNode, context: ValidationContext) {
    const keyFields = (definition.fields || []).filter(field => findDirectiveWithName(field, KEY_FIELD_DIRECTIVE));
    if (keyFields.length == 0) {
        return undefined;
    }
    if (keyFields.length > 1) {
        keyFields.forEach(f => context.addMessage(
            ValidationMessage.error(VALIDATION_ERROR_DUPLICATE_KEY_FIELD, findDirectiveWithName(f, KEY_FIELD_DIRECTIVE))));
        return undefined;
    }
    return keyFields[0];
}

function getPermissions(node: ObjectTypeDefinitionNode | FieldDefinitionNode, context: ValidationContext): PermissionsConfig | undefined {
    const rootEntityDirective = findDirectiveWithName(node, ROOT_ENTITY_DIRECTIVE);
    const permissionProfileArg = rootEntityDirective ? getNodeByName(rootEntityDirective.arguments, PERMISSION_PROFILE_ARG) : undefined;
    const permissionProfileNameAstNode = getPermissionProfileAstNode(permissionProfileArg, context);
    const rolesDirective = findDirectiveWithName(node, ROLES_DIRECTIVE);
    if (!permissionProfileArg && !rolesDirective) {
        return undefined;
    }
    const roles: RolesSpecifierConfig | undefined = rolesDirective ? {
        read: getRolesOfArg(getNodeByName(rolesDirective.arguments, ROLES_READ_ARG), context),
        readWrite: getRolesOfArg(getNodeByName(rolesDirective.arguments, ROLES_READ_WRITE_ARG), context),
        astNode: rolesDirective
    } : undefined;
    return {
        permissionProfileName: permissionProfileNameAstNode ? permissionProfileNameAstNode.value : undefined,
        permissionProfileNameAstNode,
        roles
    };
}

function getRolesOfArg(rolesArg: ArgumentNode | undefined, context: ValidationContext) {
    if (!rolesArg) {
        return undefined;
    }
    let roles: ReadonlyArray<string> | undefined = undefined;
    if (rolesArg) {
        if (rolesArg.value.kind === LIST) {
            roles = compact(rolesArg.value.values.map(val => {
                if (val.kind !== STRING) {
                    context.addMessage(ValidationMessage.error(VALIDATION_ERROR_EXPECTED_STRING_OR_LIST_OF_STRINGS, val.loc));
                    return undefined;
                } else {
                    return val.value;
                }
            }));
        } else if (rolesArg.value.kind === STRING) {
            roles = [rolesArg.value.value];
        } else {
            context.addMessage(ValidationMessage.error(VALIDATION_ERROR_EXPECTED_STRING_OR_LIST_OF_STRINGS, rolesArg.value.loc));
        }
    }
    return roles;
}

function getPermissionProfileAstNode(permissionProfileArg: ArgumentNode | undefined, context: ValidationContext): StringValueNode | undefined {
    let permissionProfileNameAstNode = undefined;
    if (permissionProfileArg) {
        if (permissionProfileArg.value.kind !== STRING) {
            context.addMessage(ValidationMessage.error(VALIDATION_ERROR_INVALID_PERMISSION_PROFILE, permissionProfileArg.value.loc));
        } else {
            permissionProfileNameAstNode = permissionProfileArg.value;
        }
    }
    return permissionProfileNameAstNode;
}

function getInverseOfASTNode(fieldNode: FieldDefinitionNode, context: ValidationContext): StringValueNode | undefined {
    const relationDirective = findDirectiveWithName(fieldNode, RELATION_DIRECTIVE);
    if (!relationDirective) {
        return undefined;
    }
    const inverseOfArg = getNodeByName(relationDirective.arguments, INVERSE_OF_ARG);
    if (!inverseOfArg) {
        return undefined;
    }
    if (inverseOfArg.value.kind !== STRING) {
        context.addMessage(ValidationMessage.error(VALIDATION_ERROR_INVERSE_OF_ARG_MUST_BE_STRING, inverseOfArg.value.loc));
        return undefined;
    }
    return inverseOfArg.value;
}

function getReferenceKeyFieldASTNode(fieldNode: FieldDefinitionNode, context: ValidationContext): StringValueNode | undefined {
    const relationDirective = findDirectiveWithName(fieldNode, REFERENCE_DIRECTIVE);
    if (!relationDirective) {
        return undefined;
    }
    const keyFieldArg = getNodeByName(relationDirective.arguments, KEY_FIELD_ARG);
    if (!keyFieldArg) {
        return undefined;
    }
    if (keyFieldArg.value.kind !== STRING) {
        // should be caught by the graphql validator anyway...
        context.addMessage(ValidationMessage.error(`The argument "${KEY_FIELD_ARG}" must be of type String`, keyFieldArg.value.loc));
        return undefined;
    }
    return keyFieldArg.value;
}

function getCollectConfig(fieldNode: FieldDefinitionNode, context: ValidationContext): CollectFieldConfig | undefined {
    const directive = findDirectiveWithName(fieldNode, COLLECT_DIRECTIVE);
    if (!directive) {
        return undefined;
    }
    const pathArg = getNodeByName(directive.arguments, COLLECT_PATH_ARG);
    if (!pathArg) {
        context.addMessage(ValidationMessage.error(`Argument "${COLLECT_PATH_ARG}" is missing`, directive.loc));
        return undefined;
    }
    if (pathArg.value.kind !== STRING) {
        // should be caught by the graphql validator anyway...
        context.addMessage(ValidationMessage.error(`The argument "${COLLECT_PATH_ARG}" must be of type String`, pathArg.value.loc));
        return undefined;
    }
    const aggregateArg = getNodeByName(directive.arguments, COLLECT_AGGREGATE_ARG);
    const aggregateValueNode = aggregateArg && aggregateArg.value;
    if (aggregateValueNode && aggregateValueNode.kind !== 'EnumValue') {
        // should be caught by the graphql validator anyway...
        context.addMessage(ValidationMessage.error(`The argument "${COLLECT_AGGREGATE_ARG}" must be an enum value`, pathArg.value.loc));
        return undefined;
    }
    return {
        astNode: directive,
        path: pathArg.value.value,
        pathASTNode: pathArg.value,
        aggregationOperator: aggregateValueNode && aggregateValueNode.value as AggregationOperator,
        aggregationOperatorASTNode: aggregateValueNode
    };
}

function extractPermissionProfiles(parsedProject: ParsedProject): ReadonlyArray<NamespacedPermissionProfileConfigMap> {
    return compact(parsedProject.sources.map((source): NamespacedPermissionProfileConfigMap | undefined => {
        if (source.kind !== ParsedProjectSourceBaseKind.OBJECT) {
            return undefined;
        }
        if (!source.object.permissionProfiles) {
            return undefined;
        }
        const profilesWithoutLocs = source.object.permissionProfiles as PermissionProfileConfigMap;
        const profiles: PermissionProfileConfigMap = mapValues(profilesWithoutLocs, (profile, name) => ({
            ...profile,
            loc: source.pathLocationMap['permissionProfiles.' + name]
        }));
        return {
            namespacePath: source.namespacePath,
            profiles
        };
    }));
}

function extractI18n(parsedProject: ParsedProject): ReadonlyArray<LocalizationConfig> {
    const objectSchemaParts = parsedProject.sources
        .filter(parsedSource => parsedSource.kind === ParsedProjectSourceBaseKind.OBJECT) as ReadonlyArray<ParsedObjectProjectSource>;
    return flatMap(objectSchemaParts, source => parseI18nConfigs(source));
}

// fake input type for index mapping
const indexDefinitionInputObjectType: GraphQLInputObjectType = new GraphQLInputObjectType({
    fields: {
        id: { type: GraphQLString },
        fields: { type: new GraphQLNonNull(new GraphQLList(GraphQLString)) },
        unique: { type: GraphQLBoolean, defaultValue: false },
        sparse: { type: GraphQLBoolean }
    },
    name: INDEX_DEFINITION_INPUT_TYPE
});

const flexSearchOrderInputObjectType: GraphQLInputObjectType = new GraphQLInputObjectType({
    name: 'FlexSearchOrderArgument',
    fields: {
        field: { type: GraphQLString },
        direction: { type: new GraphQLEnumType({ name: 'OrderDirection', values: { ASC: { value: 'ASC' }, DESC: { value: 'DESC' } } }) }
    }
});

