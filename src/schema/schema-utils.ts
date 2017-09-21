import {
    DocumentNode, FieldDefinitionNode, InputValueDefinitionNode, ObjectTypeDefinitionNode, TypeNode, Location,
} from "graphql";
import {FIELD_DEFINITION, NAME, NAMED_TYPE, NON_NULL_TYPE, OBJECT_TYPE_DEFINITION} from "graphql/language/kinds";
import {ENTITY_DIRECTIVE} from "./schema-defaults";
import {NamedTypeNode} from "graphql";
import {flatMap} from "../utils/utils";

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

