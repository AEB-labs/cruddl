import {
    ArgumentNode, EnumValueDefinitionNode, FieldDefinitionNode, GraphQLBoolean, GraphQLID, GraphQLInputObjectType,
    GraphQLList, GraphQLNonNull, GraphQLString, ObjectTypeDefinitionNode, ObjectValueNode, StringValueNode, valueFromAST
} from 'graphql';
import { merge } from 'lodash';
import {
    ParsedGraphQLProjectSource, ParsedObjectProjectSource, ParsedProject, ParsedProjectSourceBaseKind
} from '../config/parsed-project';
import {
    ENUM, ENUM_TYPE_DEFINITION, LIST, LIST_TYPE, NON_NULL_TYPE, OBJECT, OBJECT_TYPE_DEFINITION, STRING
} from '../graphql/kinds';
import { getValueFromAST } from '../graphql/value-from-ast';
import {
    CALC_MUTATIONS_DIRECTIVE, CALC_MUTATIONS_OPERATORS_ARG, CHILD_ENTITY_DIRECTIVE, DEFAULT_VALUE_DIRECTIVE,
    ENTITY_EXTENSION_DIRECTIVE, ID_FIELD, INDEX_DEFINITION_INPUT_TYPE, INDEX_DIRECTIVE, INDICES_ARG, INVERSE_OF_ARG,
    KEY_FIELD_DIRECTIVE, NAMESPACE_DIRECTIVE, NAMESPACE_NAME_ARG, NAMESPACE_SEPARATOR, OBJECT_TYPE_KIND_DIRECTIVES,
    PERMISSION_PROFILE_ARG, REFERENCE_DIRECTIVE, RELATION_DIRECTIVE, ROLES_DIRECTIVE, ROLES_READ_ARG,
    ROLES_READ_WRITE_ARG, ROOT_ENTITY_DIRECTIVE, UNIQUE_DIRECTIVE, VALUE_ARG, VALUE_OBJECT_DIRECTIVE
} from '../schema/constants';
import {
    findDirectiveWithName, getNamedTypeNodeIgnoringNonNullAndList, getNodeByName, getTypeNameIgnoringNonNullAndList
} from '../schema/schema-utils';
import { compact, flatMap } from '../utils/utils';
import {
    CalcMutationsOperator, EnumTypeConfig, FieldConfig, IndexDefinitionConfig, ObjectTypeConfig,
    PermissionProfileConfigMap, PermissionsConfig, RolesSpecifierConfig, TypeConfig, TypeKind
} from './config';
import { Model } from './implementation';
import { ModelTranslationsMap, normalizeTranslationInput } from './translation';
import { ValidationMessage } from './validation';
import { ValidationContext } from './validation/validation-context';

export function createModel(parsedProject: ParsedProject): Model {
    const validationContext = new ValidationContext();
    return new Model({
        types: createTypeInputs(parsedProject, validationContext),
        permissionProfiles: extractPermissionProfiles(parsedProject, validationContext),
        translations: extractTranslations(parsedProject, validationContext),
        validationMessages: validationContext.validationMessages
    });
}

const VALIDATION_ERROR_INVALID_PERMISSION_PROFILE = `Invalid argument value, expected string`;
const VALIDATION_ERROR_EXPECTED_STRING_OR_LIST_OF_STRINGS = 'Expected string or list of strings';
const VALIDATION_ERROR_EXPECTED_ENUM_OR_LIST_OF_ENUMS = 'Expected enum or list of enums';
const VALIDATION_ERROR_INVERSE_OF_ARG_MUST_BE_STRING = 'inverseOf must be specified as String';
const VALIDATION_ERROR_MISSING_ARGUMENT_OPERATORS = 'Missing argument \'operators\'';
const VALIDATION_ERROR_MISSING_ARGUMENT_DEFAULT_VALUE = DEFAULT_VALUE_DIRECTIVE + ' needs an argument named ' + VALUE_ARG;
const VALIDATION_ERROR_INVALID_ARGUMENT_TYPE = 'Invalid argument type.';
const VALIDATION_ERROR_DUPLICATE_KEY_FIELD = 'Only one field can be a @key field.';
const VALIDATION_ERROR_MULTIPLE_OBJECT_TYPE_DIRECTIVES = `Only one of @${ROOT_ENTITY_DIRECTIVE}, @${CHILD_ENTITY_DIRECTIVE}, @${ENTITY_EXTENSION_DIRECTIVE} or @${VALUE_OBJECT_DIRECTIVE} can be used.`;
const VALIDATION_ERROR_MISSING_OBJECT_TYPE_DIRECTIVE = `Add one of @${ROOT_ENTITY_DIRECTIVE}, @${CHILD_ENTITY_DIRECTIVE}, @${ENTITY_EXTENSION_DIRECTIVE} or @${VALUE_OBJECT_DIRECTIVE}.`;
const VALIDATION_ERROR_INVALID_DEFINITION_KIND = 'This kind of definition is not allowed. Only object and enum type definitions are allowed.';
const VALIDATION_WARNING_DUPLICATE_PERMISSION_PROFILES = 'Duplicate permission profiles (random wins!)';

function createTypeInputs(parsedProject: ParsedProject, context: ValidationContext): ReadonlyArray<TypeConfig> {
    const graphQLSchemaParts = parsedProject.sources.filter(parsedSource => parsedSource.kind === ParsedProjectSourceBaseKind.GRAPHQL) as ReadonlyArray<ParsedGraphQLProjectSource>;
    return flatMap(graphQLSchemaParts, (schemaPart => compact(schemaPart.document.definitions.map(definition => {
        // Only look at object types and enums (scalars are not supported yet, they need to be implemented somehow, e.g. via regex check)
        if (definition.kind != OBJECT_TYPE_DEFINITION && definition.kind !== ENUM_TYPE_DEFINITION) {
            context.addMessage(ValidationMessage.error(VALIDATION_ERROR_INVALID_DEFINITION_KIND, {kind: definition.kind}, definition.loc));
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

function createEnumValues(valueNodes: ReadonlyArray<EnumValueDefinitionNode>): ReadonlyArray<string> {
    return valueNodes.map(valNode => valNode.name.value);
}

function createObjectTypeInput(definition: ObjectTypeDefinitionNode, schemaPart: ParsedGraphQLProjectSource, context: ValidationContext): ObjectTypeConfig {
    const entityType = getKindOfObjectTypeNode(definition, context);

    const common = {
        name: definition.name.value,
        description: definition.description ? definition.description.value : undefined,
        astNode: definition,
        fields: (definition.fields || []).map(field => createFieldInput(field, context))
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

            return {
                ...common,
                ...processKeyField(definition, common.fields, context),
                kind: TypeKind.ROOT_ENTITY,
                permissions: getPermissions(definition, context),
                namespacePath: getNamespacePath(definition, schemaPart.namespacePath),
                indices: createIndexDefinitionInputs(definition, context)
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
            context.addMessage(ValidationMessage.warn(`The field "_key" is deprecated and should be replaced with "id" (of type "ID").`));
        } else {
            context.addMessage(ValidationMessage.error(`The field name "_key" is reserved and can only be used in combination with @key.`));
        }
    }
    const idField = fields.find(field => field.name == ID_FIELD);
    if (idField) {
        fields = fields.filter(f => f !== idField);
        if (keyFieldASTNode && keyFieldASTNode.name.value === idField.name) {
            keyFieldASTNode = idField.astNode;
            keyFieldName = ID_FIELD;
        } else {
            context.addMessage(ValidationMessage.warn(`The field "id" is redundant and should only be explicitly added when used with @key.`));
        }
        if (idField.typeName !== GraphQLID.name) {
            context.addMessage(ValidationMessage.error(`The field "id" must be of type "ID".`));
        }
    }
    return {fields, keyFieldASTNode, keyFieldName};
}

function getDefaultValue(fieldNode: FieldDefinitionNode, context: ValidationContext): any {
    const defaultValueDirective = findDirectiveWithName(fieldNode, DEFAULT_VALUE_DIRECTIVE);
    if (!defaultValueDirective) {
        return undefined;
    }
    const defaultValueArg = getNodeByName(defaultValueDirective.arguments, VALUE_ARG);
    if (!defaultValueArg) {
        context.addMessage(ValidationMessage.error(VALIDATION_ERROR_MISSING_ARGUMENT_DEFAULT_VALUE, {}, defaultValueDirective.loc));
        return undefined;
    }
    return getValueFromAST(defaultValueArg.value);
}

function createFieldInput(fieldNode: FieldDefinitionNode, context: ValidationContext): FieldConfig {
    const inverseOfASTNode = getInverseOfASTNode(fieldNode, context);
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
        isReference: !!findDirectiveWithName(fieldNode, REFERENCE_DIRECTIVE),
        isRelation: !!findDirectiveWithName(fieldNode, RELATION_DIRECTIVE),
        permissions: getPermissions(fieldNode, context),
        typeName: getTypeNameIgnoringNonNullAndList(fieldNode.type),
        typeNameAST: getNamedTypeNodeIgnoringNonNullAndList(fieldNode.type).name
    };
}

function getCalcMutationOperators(fieldNode: FieldDefinitionNode, context: ValidationContext): ReadonlyArray<CalcMutationsOperator> {
    const calcMutationsDirective = findDirectiveWithName(fieldNode, CALC_MUTATIONS_DIRECTIVE);
    if (!calcMutationsDirective) {
        return [];
    }
    const calcMutationsArg = getNodeByName(calcMutationsDirective.arguments, CALC_MUTATIONS_OPERATORS_ARG);
    if (!calcMutationsArg) {
        context.addMessage(ValidationMessage.error(VALIDATION_ERROR_MISSING_ARGUMENT_OPERATORS, undefined, calcMutationsDirective.loc));
        return [];
    }
    if (calcMutationsArg.value.kind === ENUM) {
        return [calcMutationsArg.value.value as CalcMutationsOperator];
    } else if (calcMutationsArg.value.kind === LIST) {
        return compact(calcMutationsArg.value.values.map(val => {
            if (val.kind !== ENUM) {
                context.addMessage(ValidationMessage.error(VALIDATION_ERROR_EXPECTED_ENUM_OR_LIST_OF_ENUMS, undefined, val.loc));
                return undefined;
            } else {
                return val.value as CalcMutationsOperator;
            }
        }));
    } else {
        context.addMessage(ValidationMessage.error(VALIDATION_ERROR_EXPECTED_ENUM_OR_LIST_OF_ENUMS, undefined, calcMutationsArg.value.loc));
        return [];
    }
}

function createIndexDefinitionInputs(definition: ObjectTypeDefinitionNode, context: ValidationContext): ReadonlyArray<IndexDefinitionConfig> {
    return [
        ...createRootEntityBasedIndices(definition, context),
        ...createFieldBasedIndices(definition)
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
                context.addMessage(ValidationMessage.error(VALIDATION_ERROR_INVALID_ARGUMENT_TYPE, undefined, val.loc));
                return undefined;
            }
            return buildIndexDefinitionFromObjectValue(val);
        }));
    } else {
        context.addMessage(ValidationMessage.error(VALIDATION_ERROR_INVALID_ARGUMENT_TYPE, undefined, indicesArg.loc));
        return [];
    }
}

function createFieldBasedIndices(definition: ObjectTypeDefinitionNode): ReadonlyArray<IndexDefinitionConfig> {
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
        return {
            astNode: indexDirective,
            fields: [field.name.value],
            unique: unique,
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
                context.addMessage(ValidationMessage.error(VALIDATION_ERROR_MISSING_OBJECT_TYPE_DIRECTIVE, undefined, definition.name));
            } else {
                for (const directive of kindDirectives) {
                    context.addMessage(ValidationMessage.error(VALIDATION_ERROR_MULTIPLE_OBJECT_TYPE_DIRECTIVES, undefined, directive));
                }
            }
        }
        return undefined;
    }

    return kindDirectives[0].name.value;
}

function getNamespacePath(definition: ObjectTypeDefinitionNode, sourceNamespacePath: ReadonlyArray<string>): ReadonlyArray<string> {
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
            ValidationMessage.error(VALIDATION_ERROR_DUPLICATE_KEY_FIELD,
                undefined,
                findDirectiveWithName(f, KEY_FIELD_DIRECTIVE))));
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
                    context.addMessage(ValidationMessage.error(VALIDATION_ERROR_EXPECTED_STRING_OR_LIST_OF_STRINGS, undefined, val.loc));
                    return undefined;
                } else {
                    return val.value;
                }
            }));
        }
        else if (rolesArg.value.kind === STRING) {
            roles = [rolesArg.value.value];
        } else {
            context.addMessage(ValidationMessage.error(VALIDATION_ERROR_EXPECTED_STRING_OR_LIST_OF_STRINGS, undefined, rolesArg.value.loc));
        }
    }
    return roles;
}

function getPermissionProfileAstNode(permissionProfileArg: ArgumentNode | undefined, context: ValidationContext): StringValueNode | undefined {
    let permissionProfileNameAstNode = undefined;
    if (permissionProfileArg) {
        if (permissionProfileArg.value.kind !== STRING) {
            context.addMessage(ValidationMessage.error(VALIDATION_ERROR_INVALID_PERMISSION_PROFILE, {}, permissionProfileArg.value.loc));
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
        context.addMessage(ValidationMessage.error(VALIDATION_ERROR_INVERSE_OF_ARG_MUST_BE_STRING, undefined, inverseOfArg.value.loc));
        return undefined;
    }
    return inverseOfArg.value;
}

function extractPermissionProfiles(parsedProject: ParsedProject, validationContext: ValidationContext): PermissionProfileConfigMap {
    const permissionProfilesList = parsedProject.sources.map(s => {
        if (s.kind !== ParsedProjectSourceBaseKind.OBJECT) {
            return undefined;
        }
        if (!s.object.permissionProfiles) {
            return undefined;
        }
        return s.object.permissionProfiles as PermissionProfileConfigMap;
    });
    // merge list / create map
    return compact(permissionProfilesList).reduce((prev, current) => {
        const duplicateKeys = Object.keys(prev).filter(k => Object.keys(current).includes(k));
        if (duplicateKeys.length > 0) {
            validationContext.addMessage(
                ValidationMessage.warn(VALIDATION_WARNING_DUPLICATE_PERMISSION_PROFILES, { permissionProfileNames: duplicateKeys.join(', ') })
            );
        }
        return Object.assign(prev, current);
    }, {});
}

function extractTranslations(parsedProject: ParsedProject, validationContext: ValidationContext): ModelTranslationsMap {
    const languageInput = parsedProject.sources.filter(s => s.kind === ParsedProjectSourceBaseKind.OBJECT) as ParsedObjectProjectSource[];
    // deep merge translations
    return compact(languageInput).reduce((result, currentSource) => merge(result, normalizeTranslationInput(currentSource, validationContext)), {});
}

// fake input type for index mapping
const indexDefinitionInputObjectType: GraphQLInputObjectType = new GraphQLInputObjectType({
    fields: {
        id: {type: GraphQLString},
        fields: {type: new GraphQLNonNull(new GraphQLList(GraphQLString))},
        unique: {type: GraphQLBoolean, defaultValue: false}
    },
    name: INDEX_DEFINITION_INPUT_TYPE
});
