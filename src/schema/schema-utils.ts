import {
    DocumentNode, FieldDefinitionNode, InputValueDefinitionNode, ObjectTypeDefinitionNode, TypeNode, Location,
    ScalarTypeDefinitionNode, NameNode, InputObjectTypeDefinitionNode, EnumTypeDefinitionNode,

} from "graphql";
import {
    ENUM_TYPE_DEFINITION,
    FIELD_DEFINITION, INPUT_OBJECT_TYPE_DEFINITION, NAME, NAMED_TYPE, NON_NULL_TYPE, OBJECT_TYPE_DEFINITION,
    SCALAR_TYPE_DEFINITION
} from "graphql/language/kinds";
import {EMBEDDABLE_DIRECTIVE, ENTITY_DIRECTIVE} from "./schema-defaults";
import {NamedTypeNode} from "graphql";
import {flatMap} from "../utils/utils";


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
 * Get all @link ObjectTypeDefinitionNode annotated with @Entity directive of a model.
 * @param {DocumentNode} model (ast)
 * @returns {ObjectTypeDefinitionNode[]}
 */
export function getEntityTypes(model: DocumentNode): ObjectTypeDefinitionNode[] {
    return <ObjectTypeDefinitionNode[]> model.definitions.filter(
        def => def.kind === OBJECT_TYPE_DEFINITION && def.directives && def.directives.some(
            directive => directive.name.value === ENTITY_DIRECTIVE
        )
    )
}

/**
 * Get all @link ObjectTypeDefinitionNode annotated with @Embeddable directive of a model.
 * @param {DocumentNode} model (ast)
 * @returns {ObjectTypeDefinitionNode[]}
 */
export function getEmbeddableTypes(model: DocumentNode): ObjectTypeDefinitionNode[] {
    return <ObjectTypeDefinitionNode[]> model.definitions.filter(
        def => def.kind === OBJECT_TYPE_DEFINITION && def.directives && def.directives.some(
            directive => directive.name.value === EMBEDDABLE_DIRECTIVE
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
    if (['String', 'ID', 'Int', 'Float'].includes(name)) {
        // Fake default scalar types, because they are not present in AST but will be generated later during schema creation.
        return buildScalarDefinitionNode(name)
    }
    const type = ast.definitions.find(def => (def.kind === OBJECT_TYPE_DEFINITION || def.kind === SCALAR_TYPE_DEFINITION || def.kind === ENUM_TYPE_DEFINITION) && def.name.value === name);
    if (!type) {
        throw new Error(`Undefined type ${name}`);
    }
    return type as ObjectTypeDefinitionNode|ScalarTypeDefinitionNode;
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

