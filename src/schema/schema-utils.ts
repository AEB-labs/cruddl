import {
    DirectiveNode, DocumentNode, EnumTypeDefinitionNode, EnumValueDefinitionNode, FieldDefinitionNode, GraphQLEnumValue,
    GraphQLField, GraphQLInputField, GraphQLObjectType, GraphQLType, InputObjectTypeDefinitionNode,
    InputValueDefinitionNode, Location, NameNode, ObjectTypeDefinitionNode, ScalarTypeDefinitionNode, TypeNode,
    ValueNode
} from 'graphql';
import {
    DIRECTIVE,
    ENUM_TYPE_DEFINITION, FIELD_DEFINITION, INPUT_OBJECT_TYPE_DEFINITION, LIST_TYPE, NAME, NAMED_TYPE, NON_NULL_TYPE,
    OBJECT_TYPE_DEFINITION, SCALAR_TYPE_DEFINITION
} from 'graphql/language/kinds';
import {
    CHILD_ENTITY_DIRECTIVE, ENTITY_CREATED_AT, ENTITY_EXTENSION_DIRECTIVE, ENTITY_UPDATED_AT, ID_FIELD,
    KEY_FIELD_DIRECTIVE, NAMESPACE_FIELD_PATH_DIRECTIVE, REFERENCE_DIRECTIVE, RELATION_DIRECTIVE, ROLES_DIRECTIVE,
    ROLES_READ_ARG, ROLES_READ_WRITE_ARG,
    ROOT_ENTITY_DIRECTIVE, VALUE_OBJECT_DIRECTIVE
} from './schema-defaults';
import { flatMap, objectValues } from '../utils/utils';
import {namespacedType} from "../graphql/names";


/**
 * Get all @link ObjectTypeDefinitionNode a model.
 * @param {DocumentNode} model (ast)
 * @returns {ObjectTypeDefinitionNode[]}
 */
export function getObjectTypes(model: DocumentNode): ObjectTypeDefinitionNode[] {
    return <ObjectTypeDefinitionNode[]> model.definitions.filter(
        def => def.kind === OBJECT_TYPE_DEFINITION
    )
}

/**
 * Get all @link ObjectTypeDefinitionNode annotated with @rootEntity directive of a model.
 * @param {DocumentNode} model (ast)
 * @returns {ObjectTypeDefinitionNode[]}
 */
export function getRootEntityTypes(model: DocumentNode): ObjectTypeDefinitionNode[] {
    return <ObjectTypeDefinitionNode[]> model.definitions.filter(
        def => def.kind === OBJECT_TYPE_DEFINITION && def.directives && def.directives.some(
            directive => directive.name.value === ROOT_ENTITY_DIRECTIVE
        )
    )
}

/**
 * Get all @link ObjectTypeDefinitionNode annotated with @childEntity directive of a model.
 * @param {DocumentNode} model (ast)
 * @returns {ObjectTypeDefinitionNode[]}
 */
export function getChildEntityTypes(model: DocumentNode): ObjectTypeDefinitionNode[] {
    return <ObjectTypeDefinitionNode[]> model.definitions.filter(
        def => def.kind === OBJECT_TYPE_DEFINITION && def.directives && def.directives.some(
            directive => directive.name.value === CHILD_ENTITY_DIRECTIVE
        )
    )
}

/**
 * Get all @link ObjectTypeDefinitionNode annotated with @entityExtension directive of a model.
 * @param {DocumentNode} model (ast)
 * @returns {ObjectTypeDefinitionNode[]}
 */
export function getEntityExtensionTypes(model: DocumentNode): ObjectTypeDefinitionNode[] {
    return <ObjectTypeDefinitionNode[]> model.definitions.filter(
        def => def.kind === OBJECT_TYPE_DEFINITION && def.directives && def.directives.some(
            directive => directive.name.value === ENTITY_EXTENSION_DIRECTIVE
        )
    )
}

/**
 * Get all @link ObjectTypeDefinitionNode annotated with @valueObject directive of a model.
 * @param {DocumentNode} model (ast)
 * @returns {ObjectTypeDefinitionNode[]}
 */
export function getValueObjectTypes(model: DocumentNode): ObjectTypeDefinitionNode[] {
    return <ObjectTypeDefinitionNode[]> model.definitions.filter(
        def => def.kind === OBJECT_TYPE_DEFINITION && def.directives && def.directives.some(
            directive => directive.name.value === VALUE_OBJECT_DIRECTIVE
        )
    )
}

/**
 * Get all @link FieldDefinitionNode in all @link ObjectTypeDefinition of a model (ast).
 * @param {DocumentNode} model (ast)
 * @returns {FieldDefinitionNode[]}
 */
export function getFieldDefinitionNodes(model: DocumentNode): FieldDefinitionNode[] {
    return flatMap(<ObjectTypeDefinitionNode[]> model.definitions.filter(def => def.kind === OBJECT_TYPE_DEFINITION), def => def.fields)
}

/**
 * Create a @link FieldDefinitionNode using the following arguments.
 * @param {string} name
 * @param {string} type
 * @param {Location} loc
 * @param {InputValueDefinitionNode[]} args
 * @returns {FieldDefinitionNode}
 */
export function createFieldDefinitionNode(name: string, type: string, loc?: Location, args?: InputValueDefinitionNode[]): FieldDefinitionNode {
    return {
        kind: FIELD_DEFINITION,
        name: { kind: NAME, value: name, loc: loc },
        type: {
            kind: NAMED_TYPE,
            name: {
                kind: NAME,
                value: type,
                loc: loc
            }
        },
        arguments: args || []
    }

}

/**
 * Check if a @link FieldDefinitionNode of a name and type exists.
 * @param {{fields: FieldDefinitionNode[]}} moType
 * @param {string} name
 * @returns {boolean}
 */
export function fieldDefinitionNodeByNameExists(moType: { fields: FieldDefinitionNode[] }, name: string) {
    return moType.fields.some(f => f.name.value === name);
}

/**
 * Wrap a type into a NonNullType unless it already is a NonNullType
 * @param {TypeNode} type
 * @returns {TypeNode}
 */
export function nonNullifyType(type: TypeNode): TypeNode {
    if (type.kind === NON_NULL_TYPE) {
        return type;
    }
    return {
        kind: NON_NULL_TYPE,
        type: type
    }
}

export function getScalarFieldsOfObjectDefinition(ast: DocumentNode, objectDefinition: ObjectTypeDefinitionNode): FieldDefinitionNode[] {
    return objectDefinition.fields.filter(field => {
        switch (field.type.kind) {
            case NAMED_TYPE:
                return getNamedTypeDefinitionAST(ast, field.type.name.value).kind === SCALAR_TYPE_DEFINITION
            case NON_NULL_TYPE:
                if (field.type.type.kind !== NAMED_TYPE) {
                    return false
                }
                return getNamedTypeDefinitionAST(ast, field.type.type.name.value).kind === SCALAR_TYPE_DEFINITION
            default:
                return false;
        }
    });
}

export function getNamedTypeDefinitionAST(ast: DocumentNode, name: string): ObjectTypeDefinitionNode|ScalarTypeDefinitionNode|EnumTypeDefinitionNode {
    if (['String', 'ID', 'Int', 'Float', 'Boolean'].includes(name)) {
        // Fake default scalar types, because they are not present in AST but will be generated later during schema creation.
        return buildScalarDefinitionNode(name)
    }
    const type = ast.definitions.find(def => (def.kind === OBJECT_TYPE_DEFINITION || def.kind === SCALAR_TYPE_DEFINITION || def.kind === ENUM_TYPE_DEFINITION) && def.name.value === name);
    if (!type) {
        throw new Error(`Undefined type ${name}`);
    }
    return type as ObjectTypeDefinitionNode|ScalarTypeDefinitionNode|EnumTypeDefinitionNode;
}

export function getTypeNameIgnoringNonNullAndList(typeNode: TypeNode): string {
    switch (typeNode.kind) {
        case NON_NULL_TYPE:
        case LIST_TYPE:
            return getTypeNameIgnoringNonNullAndList(typeNode.type);
        case NAMED_TYPE:
            return typeNode.name.value;
    }
}

export function getNamedInputTypeDefinitionAST(ast: DocumentNode, name: string): InputObjectTypeDefinitionNode|ScalarTypeDefinitionNode {
    return ast.definitions.find(def => (def.kind === INPUT_OBJECT_TYPE_DEFINITION || def.kind === SCALAR_TYPE_DEFINITION) && def.name.value === name) as InputObjectTypeDefinitionNode|ScalarTypeDefinitionNode;
}

export function buildScalarDefinitionNode(name: string): ScalarTypeDefinitionNode {
    return {
        kind: SCALAR_TYPE_DEFINITION,
        name: { kind: NAME, value: name }
    }
}

export function buildNameNode(name: string): NameNode {
    return { kind: NAME, value: name };
}

export function findDirectiveWithName(typeOrField: ObjectTypeDefinitionNode|FieldDefinitionNode|InputValueDefinitionNode|EnumValueDefinitionNode, directiveName: string): DirectiveNode|undefined {
    // remove leading @
    if (directiveName[0] === '@') {
        directiveName = directiveName.substr(1, directiveName.length - 1);
    }
    if (!typeOrField.directives) {
        return undefined;
    }
    return typeOrField.directives.find(directive => directive.name.value === directiveName);
}

export function hasDirectiveWithName(typeOrField: ObjectTypeDefinitionNode|FieldDefinitionNode|InputValueDefinitionNode, directiveName: string): boolean {
    return !!findDirectiveWithName(typeOrField, directiveName);
}

function getTypeDefinitionNode(type: GraphQLType): ObjectTypeDefinitionNode|undefined {
    if (!(type instanceof GraphQLObjectType)) {
        return undefined;
    }
    return (type as any).astNode;
}

function getFieldDefinitionNode(field: GraphQLField<any, any>): FieldDefinitionNode {
    const astNode = field.astNode;
    if (!astNode) {
        throw new Error(`astNode on field ${field.name} expected but missing`);
    }
    return astNode;
}

function getInputFieldDefinitionNode(field: GraphQLInputField): InputValueDefinitionNode {
    const astNode = field.astNode;
    if (!astNode) {
        throw new Error(`astNode on input field ${field.name} expected but missing`);
    }
    return astNode;
}

function getASTNodeWithDirectives(field: GraphQLInputField|GraphQLField<any, any>|GraphQLEnumValue): InputValueDefinitionNode|FieldDefinitionNode|EnumValueDefinitionNode {
    const astNode = field.astNode;
    if (!astNode) {
        throw new Error(`astNode on field ${field.name} expected but missing`);
    }
    return astNode;
}

export function isTypeWithIdentity(type: GraphQLType) {
    const astNode = getTypeDefinitionNode(type);
    if (!astNode) {
        return false;
    }
    return hasDirectiveWithName(astNode, ROOT_ENTITY_DIRECTIVE) ||
        hasDirectiveWithName(astNode, CHILD_ENTITY_DIRECTIVE);
}

export function isRootEntityType(type: GraphQLType) {
    const astNode = getTypeDefinitionNode(type);
    if (!astNode) {
        return false;
    }
    return hasDirectiveWithName(astNode, ROOT_ENTITY_DIRECTIVE);
}

export function isEntityExtensionType(type: GraphQLType) {
    const astNode = getTypeDefinitionNode(type);
    if (!astNode) {
        return false;
    }
    return hasDirectiveWithName(astNode, ENTITY_EXTENSION_DIRECTIVE);
}

export function isChildEntityType(type: GraphQLType) {
    const astNode = getTypeDefinitionNode(type);
    if (!astNode) {
        return false;
    }
    return hasDirectiveWithName(astNode, CHILD_ENTITY_DIRECTIVE);
}

export function isRelationField(field: GraphQLField<any, any>) {
    const astNode = getFieldDefinitionNode(field);
    return hasDirectiveWithName(astNode, RELATION_DIRECTIVE);
}

export function isReferenceField(field: GraphQLField<any, any>) {
    const astNode = getFieldDefinitionNode(field);
    return hasDirectiveWithName(astNode, REFERENCE_DIRECTIVE);
}

export function isKeyField(field: GraphQLField<any, any>) {
    const astNode = getFieldDefinitionNode(field);
    return hasDirectiveWithName(astNode, KEY_FIELD_DIRECTIVE);
}

export function getStringListValues(value: ValueNode): string[] {
    if (value.kind == 'ListValue') {
        return value.values.map(value => {
            if (value.kind == 'StringValue') {
                return value.value;
            }
            throw new Error(`Expected string, got ${value.kind}`)
        });
    }
    if (value.kind == 'StringValue') {
        return [ value.value ];
    }
    throw new Error(`Expected string or list of string, got ${value.kind}`);
}

export function getAllowedReadRoles(field: GraphQLField<any, any>|GraphQLInputField|GraphQLEnumValue): string[]|undefined {
    const readRoles = getAllowedRoles(field, ROLES_READ_ARG);
    const readWriteRoles = getAllowedRoles(field, ROLES_READ_WRITE_ARG);
    if (readRoles && readWriteRoles) {
        return Array.from(new Set([...readRoles, ...readWriteRoles]));
    }
    return readRoles || readWriteRoles;
}

export function getAllowedWriteRoles(field: GraphQLField<any, any>|GraphQLInputField|GraphQLEnumValue): string[]|undefined {
    return getAllowedRoles(field, ROLES_READ_WRITE_ARG);
}

export function getRoleListFromDirective(directive: DirectiveNode, argName: string): string[] {
    const arg = (directive.arguments || []).find(arg => arg.name.value == argName);
    if (arg) {
        return getStringListValues(arg.value);
    }

    // if the directive is specified but an arg is missing, this default to [] (default to secure option)
    return [];
}

function getAllowedRoles(field: GraphQLField<any, any>|GraphQLInputField|GraphQLEnumValue, argName: string): string[]|undefined {
    const astNode = getASTNodeWithDirectives(field);
    const directive = findDirectiveWithName(astNode, ROLES_DIRECTIVE);
    if (!directive) {
        // directive missing, so no restriction
        return undefined;
    }
    return getRoleListFromDirective(directive, argName);
}

/**
 * Determines whether a field is controlled by the system and can not be written directly by the user
 * @param {GraphQLField<any, any>} field
 * @returns {boolean}
 */
export function isWriteProtectedSystemField(field: GraphQLField<any, any>, parentType: GraphQLObjectType) {
    if (!isTypeWithIdentity(parentType)) {
        // value objects and extensions do not have system fields
        return false;
    }
    return field.name == ID_FIELD || field.name == ENTITY_CREATED_AT || field.name == ENTITY_UPDATED_AT;
}

export function getSingleKeyField(type: GraphQLObjectType): GraphQLField<any, any>|undefined {
    const keyFields = objectValues(type.getFields()).filter(field => isKeyField(field));
    if (keyFields.length != 1) {
        return undefined;
    }
    return keyFields[0];
}

export function getReferenceKeyField(objectTypeWithKeyField: ObjectTypeDefinitionNode): string {
    const field = objectTypeWithKeyField.fields.find(field => field.directives != undefined && field.directives.some(directive => directive.name.value === KEY_FIELD_DIRECTIVE));
    if (!field) {
        throw new Error(`Missing @key directive on ${objectTypeWithKeyField.name.value}`);
    }
    return getTypeNameIgnoringNonNullAndList(field.type);
}

export function getNodeByName<T extends {name: NameNode}>(listOfNodes: T[]|undefined, name: string): T|undefined {
    if (!listOfNodes) {
        return undefined;
    }
    return listOfNodes.find(node => node.name.value === name);
}

export function createObjectTypeNode(name: string): ObjectTypeDefinitionNode {
    return {
        kind: OBJECT_TYPE_DEFINITION,
        name: buildNameNode(name),
        fields: []
    }
}

export function createFieldWithDirective(name: string, typeName: string, directiveName: string): FieldDefinitionNode {
    return {
        kind: FIELD_DEFINITION,
        name: buildNameNode(name),
        type: {
            kind: NAMED_TYPE,
            name: buildNameNode(typeName),
        },
        arguments: [],
        directives: [
            {
                kind: DIRECTIVE,
                name: buildNameNode(directiveName),
                arguments: []
            }
        ]
    }
}

/**
 * walks one namespace part along the namespace path. Creates missing fields and types and returns the current node.
 *
 * @param ast
 * @param {ObjectTypeDefinitionNode} currentNode - the starting node
 * @param {string} namespacePart - one step of the namespace to walk
 * @param baseOperationType "Query" or "Mutation"
 * @returns {ObjectTypeDefinitionNode}
 */
export function enterOrCreateNextNamespacePart(ast: DocumentNode, currentNode: ObjectTypeDefinitionNode, namespacePart: string, baseOperationType: string): ObjectTypeDefinitionNode {
    let namespacePartField = getNodeByName(currentNode.fields, namespacePart);
    if (namespacePartField) {
        // Hey, were done, this one already exists. Just search and return the corresponding type.
        const arrivingNode = getNodeByName(getObjectTypes(ast), namespacedType(namespacePart, baseOperationType));
        if (!arrivingNode) {
            throw Error(`Found path field ${namespacePart} but not corresponding type. That seems a bit strange...`);
        }
        return arrivingNode;
    } else {
        const arrivingNode = createObjectTypeNode(namespacedType(namespacePart, baseOperationType));
        ast.definitions.push(arrivingNode);
        currentNode.fields.push(createFieldWithDirective(namespacePart, namespacedType(namespacePart, baseOperationType), NAMESPACE_FIELD_PATH_DIRECTIVE));
        return arrivingNode;
    }
}
