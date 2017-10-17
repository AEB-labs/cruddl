import {
    DocumentNode,
    EnumTypeDefinitionNode,
    FieldDefinitionNode, GraphQLField, GraphQLObjectType, GraphQLType,
    InputObjectTypeDefinitionNode,
    InputValueDefinitionNode,
    Location,
    NameNode,
    ObjectTypeDefinitionNode,
    ScalarTypeDefinitionNode,
    TypeNode
} from 'graphql';
import {
    ENUM_TYPE_DEFINITION,
    FIELD_DEFINITION,
    INPUT_OBJECT_TYPE_DEFINITION,
    LIST_TYPE,
    NAME,
    NAMED_TYPE,
    NON_NULL_TYPE,
    OBJECT_TYPE_DEFINITION,
    SCALAR_TYPE_DEFINITION
} from "graphql/language/kinds";
import {
    CHILD_ENTITY_DIRECTIVE,
    ENTITY_EXTENSION_DIRECTIVE, KEY_FIELD_DIRECTIVE, REFERENCE_DIRECTIVE, RELATION_DIRECTIVE,
    ROOT_ENTITY_DIRECTIVE,
    VALUE_OBJECT_DIRECTIVE
} from './schema-defaults';
import { flatMap, objectValues } from '../utils/utils';


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

export function hasDirectiveWithName(typeOrField: ObjectTypeDefinitionNode|FieldDefinitionNode, directiveName: string): boolean {
    // remove leading @
    if (directiveName[0] === '@') {
        directiveName = directiveName.substr(1, directiveName.length - 1);
    }
    if (!typeOrField.directives) {
        return false;
    }
    return typeOrField.directives.some(directive => directive.name.value === directiveName);
}

function getTypeDefinitionNode(type: GraphQLType): ObjectTypeDefinitionNode|undefined {
    if (!(type instanceof GraphQLObjectType)) {
        return undefined;
    }
    return (type as any).astNode;
}

function getFieldDefinitionNode(field: GraphQLField<any, any>): FieldDefinitionNode {
    const astNode: FieldDefinitionNode = (field as any).astNode;
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
