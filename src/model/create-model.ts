import { SchemaConfig, SchemaPartConfig } from '../config/schema-config';
import { Model } from './implementation';
import {
    CalcMutationsOperator, EnumTypeInput, FieldInput, IndexDefinitionInput, ObjectTypeInput, ScalarTypeInput, TypeInput,
    TypeKind
} from './input';
import { compact, flatMap } from '../utils/utils';
import {
    ENUM, ENUM_TYPE_DEFINITION, LIST, LIST_TYPE, NON_NULL_TYPE, OBJECT, OBJECT_TYPE_DEFINITION, SCALAR_TYPE_DEFINITION,
    STRING
} from '../graphql/kinds';
import {
    ArgumentNode, EnumValueDefinitionNode, FieldDefinitionNode, GraphQLBoolean, GraphQLInputObjectType, GraphQLList,
    GraphQLNonNull, GraphQLString, ObjectTypeDefinitionNode, ObjectValueNode, StringValueNode, valueFromAST
} from 'graphql';
import {
    findDirectiveWithName, getNamedTypeNodeIgnoringNonNullAndList, getNodeByName, getTypeNameIgnoringNonNullAndList
} from '../schema/schema-utils';
import {
    CALC_MUTATIONS_DIRECTIVE, CALC_MUTATIONS_OPERATORS_ARG, CHILD_ENTITY_DIRECTIVE, DEFAULT_VALUE_DIRECTIVE,
    ENTITY_EXTENSION_DIRECTIVE, INDEX_DEFINITION_INPUT_TYPE, INDEX_DIRECTIVE, INDICES_ARG, INVERSE_OF_ARG,
    KEY_FIELD_DIRECTIVE, NAMESPACE_DIRECTIVE, NAMESPACE_NAME_ARG, NAMESPACE_SEPARATOR, OBJECT_TYPE_ENTITY_DIRECTIVES,
    PERMISSION_PROFILE_ARG, REFERENCE_DIRECTIVE, RELATION_DIRECTIVE, ROLES_DIRECTIVE, ROLES_READ_ARG,
    ROLES_READ_WRITE_ARG, ROOT_ENTITY_DIRECTIVE, UNIQUE_DIRECTIVE, VALUE_ARG, VALUE_OBJECT_DIRECTIVE
} from '../schema/schema-defaults';
import { ValidationMessage } from './validation';
import { VALIDATION_ERROR_MISSING_OBJECT_TYPE_DIRECTIVE } from '../schema/preparation/ast-validation-modules/object-type-directive-count-validator';
import { VALIDATION_ERROR_DUPLICATE_KEY_FIELD } from '../schema/preparation/ast-validation-modules/key-field-validator';
import { PermissionsInput } from './input/permissions';
import { VALIDATION_ERROR_MISSING_ARGUMENT_DEFAULT_VALUE } from '../schema/preparation/ast-validation-modules/default-value-validator';
import { flattenValueNode } from '../schema/directive-arg-flattener';
import { VALIDATION_ERROR_INVALID_PERMISSION_PROFILE } from '../schema/preparation/ast-validation-modules/undefined-permission-profile';
import { VALIDATION_ERROR_INVALID_ARGUMENT_TYPE } from '../schema/preparation/ast-validation-modules/check-directed-relation-edges-validator';

export function createModel(input: SchemaConfig): Model {
    const validationMessages: ValidationMessage[] = [];
    return new Model({
        types: createTypeInputs(input, validationMessages),
        permissionProfiles: input.permissionProfiles,
        validationMessages: validationMessages
    });
}

export const VALIDATION_ERROR_EXPECTED_STRING_OR_LIST_OF_STRINGS = 'Expected string or list of strings';
export const VALIDATION_ERROR_EXPECTED_ENUM_OR_LIST_OF_ENUMS = 'Expected enum or list of enums';
export const VALIDATION_ERROR_INVERSE_OF_ARG_MUST_BE_STRING = 'inverseOf must be specified as String';
export const VALIDATION_ERROR_MISSING_ARGUMENT_OPERATORS = 'Missing argument \'operators\'';
export const VALIDATION_ERROR_MISSING_ARGUMENT_INDICES = 'Missing argument \'indices\'';

function createTypeInputs(input: SchemaConfig, validationMessages: ValidationMessage[]): ReadonlyArray<TypeInput> {
    return flatMap(input.schemaParts, (schemaPart => compact(schemaPart.document.definitions.map(definition => {
        // Only look at scalars, object types and enums
        if (definition.kind !== SCALAR_TYPE_DEFINITION && definition.kind != OBJECT_TYPE_DEFINITION && definition.kind !== ENUM_TYPE_DEFINITION) {
            return undefined;
        }

        const common = {
            description: definition.description ? definition.description.value : undefined,
            name: definition.name.value,
        };

        switch (definition.kind) {
            case SCALAR_TYPE_DEFINITION:
                const scalarTypeInput: ScalarTypeInput = {
                    ...common,
                    astNode: definition,
                    kind: TypeKind.SCALAR,
                };
                return scalarTypeInput;
            case ENUM_TYPE_DEFINITION:
                const enumTypeInput: EnumTypeInput = {
                    ...common,
                    astNode: definition,
                    kind: TypeKind.ENUM,
                    values: createEnumValues(definition.values)
                };
                return enumTypeInput;
            case OBJECT_TYPE_DEFINITION:
                return createObjectTypeInput(definition, schemaPart, validationMessages);
            default: return undefined;
        }

    }))))
}

function createEnumValues(valueNodes: EnumValueDefinitionNode[]): string[] {
    return valueNodes.map(valNode => valNode.name.value);
}

function createObjectTypeInput(definition: ObjectTypeDefinitionNode, schemaPart: SchemaPartConfig, validationMessages: ValidationMessage[]): ObjectTypeInput {
    const entityType = getKindOfObjectTypeNode(definition);

    const common = {
        name: definition.name.value,
        description: definition.description ? definition.description.value : undefined,
        astNode: definition,
        fields: definition.fields.map(field => createFieldInput(field, validationMessages)),
    };

    switch(entityType) {
        case CHILD_ENTITY_DIRECTIVE:
            return {
                kind: TypeKind.CHILD_ENTITY,
                ...common,
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
            if (entityType === undefined) {
                validationMessages.push(ValidationMessage.error(VALIDATION_ERROR_MISSING_OBJECT_TYPE_DIRECTIVE, undefined, definition.loc))
                // interpret as root entity to be able to create the rest of the model input
            }
            const keyFieldASTNode: FieldDefinitionNode|undefined = getKeyFieldASTNode(definition, validationMessages);
            return {
                ...common,
                kind: TypeKind.ROOT_ENTITY,
                permissions: getPermissions(definition, validationMessages),
                namespacePath: getNamespacePath(definition, schemaPart.localNamespace),
                indices: createIndexDefinitionInputs(definition, validationMessages),
                keyFieldASTNode,
                keyFieldName: keyFieldASTNode ? keyFieldASTNode.name.value : undefined
            };
    }

}

function getDefaultValue(fieldNode: FieldDefinitionNode, validationMessages: ValidationMessage[]): any {
    const defaultValueDirective = findDirectiveWithName(fieldNode, DEFAULT_VALUE_DIRECTIVE);
    if (!defaultValueDirective) { return undefined; }
    const defaultValueArg = getNodeByName(defaultValueDirective.arguments, VALUE_ARG);
    if (!defaultValueArg) {
        validationMessages.push(ValidationMessage.error(VALIDATION_ERROR_MISSING_ARGUMENT_DEFAULT_VALUE, {}, defaultValueDirective.loc));
        return undefined;
    }
    return flattenValueNode(defaultValueArg.value);
}

function createFieldInput(fieldNode: FieldDefinitionNode, validationMessages: ValidationMessage[]): FieldInput {
    const inverseOfASTNode = getInverseOfASTNode(fieldNode, validationMessages);
    return {
        name: fieldNode.name.value,
        description: fieldNode.description ? fieldNode.description.value : undefined,
        astNode: fieldNode,
        calcMutationOperators: getCalcMutationOperators(fieldNode, validationMessages),
        defaultValueASTNode: findDirectiveWithName(fieldNode, DEFAULT_VALUE_DIRECTIVE),
        defaultValue: getDefaultValue(fieldNode, validationMessages),
        inverseOfASTNode,
        inverseOfFieldName: inverseOfASTNode ? inverseOfASTNode.value : undefined,
        isList: fieldNode.type.kind === LIST_TYPE || (fieldNode.type.kind === NON_NULL_TYPE && fieldNode.type.type.kind === LIST_TYPE),
        isReference: !!findDirectiveWithName(fieldNode, REFERENCE_DIRECTIVE),
        isRelation: !!findDirectiveWithName(fieldNode, RELATION_DIRECTIVE),
        permissions: getPermissions(fieldNode, validationMessages),
        typeName: getTypeNameIgnoringNonNullAndList(fieldNode.type),
        typeNameAST: getNamedTypeNodeIgnoringNonNullAndList(fieldNode.type).name
    };
}

function getCalcMutationOperators(fieldNode: FieldDefinitionNode, validationMessages: ValidationMessage[]): CalcMutationsOperator[] {
    const calcMutationsDirective = findDirectiveWithName(fieldNode, CALC_MUTATIONS_DIRECTIVE);
    if (!calcMutationsDirective) {
        return [];
    }
    const calcMutationsArg = getNodeByName(calcMutationsDirective.arguments, CALC_MUTATIONS_OPERATORS_ARG);
    if (!calcMutationsArg) {
        validationMessages.push(ValidationMessage.error(VALIDATION_ERROR_MISSING_ARGUMENT_OPERATORS, undefined, calcMutationsDirective.loc));
        return [];
    }
    if (calcMutationsArg.value.kind === ENUM) {
        return [calcMutationsArg.value.value as CalcMutationsOperator];
    } else if (calcMutationsArg.value.kind === LIST) {
        return compact(calcMutationsArg.value.values.map(val => {
            if (val.kind !== ENUM) {
                validationMessages.push(ValidationMessage.error(VALIDATION_ERROR_EXPECTED_ENUM_OR_LIST_OF_ENUMS, undefined, val.loc));
                return undefined;
            } else {
                return val.value as CalcMutationsOperator
            }
        }));
    } else {
        validationMessages.push(ValidationMessage.error(VALIDATION_ERROR_EXPECTED_ENUM_OR_LIST_OF_ENUMS, undefined, calcMutationsArg.value.loc));
        return [];
    }
}

function createIndexDefinitionInputs(definition: ObjectTypeDefinitionNode, validationMessages: ValidationMessage[]): IndexDefinitionInput[] {
    return [
        ...createRootEntityBasedIndices(definition, validationMessages),
        ...createFieldBasedIndices(definition)
    ];
}

function createRootEntityBasedIndices(definition: ObjectTypeDefinitionNode, validationMessages: ValidationMessage[]): IndexDefinitionInput[] {
    const rootEntityDirective = findDirectiveWithName(definition, ROOT_ENTITY_DIRECTIVE);
    if (!rootEntityDirective) { return []; }
    const indicesArg = getNodeByName(rootEntityDirective.arguments, INDICES_ARG);
    if (!indicesArg) {
        return []
    }
    if (indicesArg.value.kind === OBJECT) {
        return [buildIndexDefinitionFromObjectValue(indicesArg.value)];
    } else if (indicesArg.value.kind === LIST) {
        return compact(indicesArg.value.values.map(val => {
            if (val.kind !== OBJECT) {
                validationMessages.push(ValidationMessage.error(VALIDATION_ERROR_INVALID_ARGUMENT_TYPE, undefined, val.loc));
                return undefined;
            }
            return buildIndexDefinitionFromObjectValue(val);
        }))
    } else {
        validationMessages.push(ValidationMessage.error(VALIDATION_ERROR_INVALID_ARGUMENT_TYPE, undefined, indicesArg.loc));
        return [];
    }
}

function createFieldBasedIndices(definition: ObjectTypeDefinitionNode): IndexDefinitionInput[] {
    return compact(definition.fields.map(field => {
        let unique = false;
        let index = findDirectiveWithName(field, INDEX_DIRECTIVE);
        if (!index) {
            index = findDirectiveWithName(field, UNIQUE_DIRECTIVE);
            unique = !!index
        }
        if (!index) {
            return undefined;
        }
        return {
            astNode: index,
            fields: [field.name.value],
            unique: unique
        };
    }))
}

function buildIndexDefinitionFromObjectValue(indexDefinitionNode: ObjectValueNode): IndexDefinitionInput {
    return {
        ...mapIndexDefinition(indexDefinitionNode),
        astNode: indexDefinitionNode
    };
}

function mapIndexDefinition(index: ObjectValueNode): IndexDefinitionInput {
    return valueFromAST(index, indexDefinitionInputObjectType)
}

function getKindOfObjectTypeNode(definition: ObjectTypeDefinitionNode): string | undefined {
    if (!definition.directives) {
        return undefined;
    }
    const kindDirectives = definition.directives.filter(dir => OBJECT_TYPE_ENTITY_DIRECTIVES.includes(dir.name.value));
    if (kindDirectives.length !== 1) {
        return undefined;
    }
    return kindDirectives[0].name.value;
}

function getNamespacePath(definition: ObjectTypeDefinitionNode, localNamespace: string|undefined): string[] {
    const directiveNamespace = findDirectiveWithName(definition, NAMESPACE_DIRECTIVE);
    if (!directiveNamespace || !directiveNamespace.arguments) {
        return localNamespace ? localNamespace.split(NAMESPACE_SEPARATOR) : [];
    }
    const directiveNamespaceArg = getNodeByName(directiveNamespace.arguments, NAMESPACE_NAME_ARG);
    return directiveNamespaceArg && directiveNamespaceArg.value.kind === STRING ? directiveNamespaceArg.value.value.split(NAMESPACE_SEPARATOR) : [];
}

function getKeyFieldASTNode(definition: ObjectTypeDefinitionNode, validationMessages: ValidationMessage[]) {
    const keyFields = definition.fields.filter(field => findDirectiveWithName(field, KEY_FIELD_DIRECTIVE));
    if (keyFields.length == 0) {
        return undefined;
    }
    if (keyFields.length > 1) {
        keyFields.forEach(f => validationMessages.push(
            ValidationMessage.error(VALIDATION_ERROR_DUPLICATE_KEY_FIELD,
                undefined,
                findDirectiveWithName(f, KEY_FIELD_DIRECTIVE))));
        return undefined;
    }
    return keyFields[0];
}

function getPermissions(node: ObjectTypeDefinitionNode|FieldDefinitionNode, validationMessages: ValidationMessage[]): PermissionsInput|undefined {
    const rootEntityDirective = findDirectiveWithName(node, ROOT_ENTITY_DIRECTIVE);
    const permissionProfileArg = rootEntityDirective ? getNodeByName(rootEntityDirective.arguments, PERMISSION_PROFILE_ARG) : undefined;
    const permissionProfileNameAstNode = getPermissionProfileAstNode(permissionProfileArg, validationMessages);
    const rolesDirective = findDirectiveWithName(node, ROLES_DIRECTIVE);
    if (!permissionProfileArg && !rolesDirective) {
        return undefined;
    }
    const roles = rolesDirective ? {
        read: getRolesOfArg(getNodeByName(rolesDirective.arguments, ROLES_READ_ARG), validationMessages),
        readWrite: getRolesOfArg(getNodeByName(rolesDirective.arguments, ROLES_READ_WRITE_ARG), validationMessages)
    } : undefined;
    return {
        permissionProfileName: permissionProfileNameAstNode ? permissionProfileNameAstNode.value : undefined,
        permissionProfileNameAstNode,
        roles,
        rolesASTNode: rolesDirective
    };
}

function getRolesOfArg(rolesArg: ArgumentNode|undefined, validationMessages: ValidationMessage[]) {
    if (!rolesArg) {
        return undefined;
    }
    let roles: string[]|undefined = undefined;
    if (rolesArg) {
        if (rolesArg.value.kind === LIST) {
            roles = compact(rolesArg.value.values.map(val => {
                if (val.kind !== STRING) {
                    validationMessages.push(ValidationMessage.error(VALIDATION_ERROR_EXPECTED_STRING_OR_LIST_OF_STRINGS, undefined, val.loc));
                    return undefined;
                } else {
                    return val.value
                }
            }));
        }
        else if (rolesArg.value.kind === STRING) {
            roles = [rolesArg.value.value];
        } else {
            validationMessages.push(ValidationMessage.error(VALIDATION_ERROR_EXPECTED_STRING_OR_LIST_OF_STRINGS, undefined, rolesArg.value.loc))
        }
    }
    return roles;
}

function getPermissionProfileAstNode(permissionProfileArg: ArgumentNode|undefined, validationMessages: ValidationMessage[]): StringValueNode|undefined {
    let permissionProfileNameAstNode = undefined;
    if (permissionProfileArg) {
        if (permissionProfileArg.value.kind !== STRING) {
            validationMessages.push(ValidationMessage.error(VALIDATION_ERROR_INVALID_PERMISSION_PROFILE, {}, permissionProfileArg.value.loc))
        } else {
            permissionProfileNameAstNode = permissionProfileArg.value;
        }
    }
    return permissionProfileNameAstNode;
}

function getInverseOfASTNode(fieldNode: FieldDefinitionNode, validationMessages: ValidationMessage[]): StringValueNode|undefined {
    const relationDirective = findDirectiveWithName(fieldNode, RELATION_DIRECTIVE);
    if (!relationDirective) {
        return undefined;
    }
    const inverseOfArg = getNodeByName(relationDirective.arguments, INVERSE_OF_ARG);
    if (!inverseOfArg) {
        return undefined;
    }
    if (inverseOfArg.value.kind !== STRING) {
        validationMessages.push(ValidationMessage.error(VALIDATION_ERROR_INVERSE_OF_ARG_MUST_BE_STRING, undefined, inverseOfArg.value.loc));
        return undefined;
    }
    return inverseOfArg.value;
}


// fake input type for index mapping
const indexDefinitionInputObjectType: GraphQLInputObjectType = new GraphQLInputObjectType({
        fields: {
            id: { type: GraphQLString },
            fields: { type: new GraphQLNonNull(new GraphQLList(GraphQLString))},
            unique: { type: GraphQLBoolean, defaultValue: false }
        },
        name: INDEX_DEFINITION_INPUT_TYPE
    });
