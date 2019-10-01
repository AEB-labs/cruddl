import {
    DirectiveNode, DocumentNode, EnumTypeDefinitionNode, EnumValueDefinitionNode, FieldDefinitionNode,
    InputObjectTypeDefinitionNode, InputValueDefinitionNode, NamedTypeNode, NameNode, ObjectTypeDefinitionNode,
    ScalarTypeDefinitionNode, TypeDefinitionNode, TypeNode
} from 'graphql';
import {
    ENUM_TYPE_DEFINITION, INPUT_OBJECT_TYPE_DEFINITION, LIST_TYPE, NAME, NAMED_TYPE, NON_NULL_TYPE,
    OBJECT_TYPE_DEFINITION, SCALAR_TYPE_DEFINITION
} from '../graphql/kinds';
import { SourcePosition } from '../model/validation';
import { ProjectSource } from '../project/source';
import {
    CHILD_ENTITY_DIRECTIVE, ENTITY_EXTENSION_DIRECTIVE, ROOT_ENTITY_DIRECTIVE, VALUE_OBJECT_DIRECTIVE
} from './constants';
import { CORE_SCALARS } from './graphql-base';

/**
 * Get all @link ObjectTypeDefinitionNode a model.
 * @param {DocumentNode} model (ast)
 * @returns {ObjectTypeDefinitionNode[]}
 */
export function getObjectTypes(model: DocumentNode): ReadonlyArray<ObjectTypeDefinitionNode> {
    return <ObjectTypeDefinitionNode[]> model.definitions.filter(
        def => def.kind === OBJECT_TYPE_DEFINITION
    );
}

export function getEnumTypes(model: DocumentNode): ReadonlyArray<ObjectTypeDefinitionNode> {
    return <ObjectTypeDefinitionNode[]> model.definitions.filter(
        def => def.kind === ENUM_TYPE_DEFINITION
    );
}

/**
 * Get all @link ObjectTypeDefinitionNode annotated with @rootEntity directive of a model.
 * @param {DocumentNode} model (ast)
 * @returns {ObjectTypeDefinitionNode[]}
 */
export function getRootEntityTypes(model: DocumentNode): ReadonlyArray<ObjectTypeDefinitionNode> {
    return <ObjectTypeDefinitionNode[]> model.definitions.filter(
        def => def.kind === OBJECT_TYPE_DEFINITION && def.directives && def.directives.some(
            directive => directive.name.value === ROOT_ENTITY_DIRECTIVE
        )
    );
}

/**
 * Get all @link ObjectTypeDefinitionNode annotated with @childEntity directive of a model.
 * @param {DocumentNode} model (ast)
 * @returns {ObjectTypeDefinitionNode[]}
 */
export function getChildEntityTypes(model: DocumentNode): ReadonlyArray<ObjectTypeDefinitionNode> {
    return <ObjectTypeDefinitionNode[]> model.definitions.filter(
        def => def.kind === OBJECT_TYPE_DEFINITION && def.directives && def.directives.some(
            directive => directive.name.value === CHILD_ENTITY_DIRECTIVE
        )
    );
}

/**
 * Get all @link ObjectTypeDefinitionNode annotated with @entityExtension directive of a model.
 * @param {DocumentNode} model (ast)
 * @returns {ObjectTypeDefinitionNode[]}
 */
export function getEntityExtensionTypes(model: DocumentNode): ReadonlyArray<ObjectTypeDefinitionNode> {
    return <ObjectTypeDefinitionNode[]> model.definitions.filter(
        def => def.kind === OBJECT_TYPE_DEFINITION && def.directives && def.directives.some(
            directive => directive.name.value === ENTITY_EXTENSION_DIRECTIVE
        )
    );
}

/**
 * Get all @link ObjectTypeDefinitionNode annotated with @valueObject directive of a model.
 * @param {DocumentNode} model (ast)
 * @returns {ObjectTypeDefinitionNode[]}
 */
export function getValueObjectTypes(model: DocumentNode): ReadonlyArray<ObjectTypeDefinitionNode> {
    return <ObjectTypeDefinitionNode[]> model.definitions.filter(
        def => def.kind === OBJECT_TYPE_DEFINITION && def.directives && def.directives.some(
            directive => directive.name.value === VALUE_OBJECT_DIRECTIVE
        )
    );
}

function getScalarFieldsOfObjectDefinition(ast: DocumentNode, objectDefinition: ObjectTypeDefinitionNode): ReadonlyArray<FieldDefinitionNode> {
    return (objectDefinition.fields || []).filter(field => {
        switch (field.type.kind) {
            case NAMED_TYPE:
                return getNamedTypeDefinitionAST(ast, field.type.name.value).kind === SCALAR_TYPE_DEFINITION;
            case NON_NULL_TYPE:
                if (field.type.type.kind !== NAMED_TYPE) {
                    return false;
                }
                return getNamedTypeDefinitionAST(ast, field.type.type.name.value).kind === SCALAR_TYPE_DEFINITION;
            default:
                return false;
        }
    });
}

function getNamedTypeDefinitionASTIfExists(ast: DocumentNode, name: string): ObjectTypeDefinitionNode|ScalarTypeDefinitionNode|EnumTypeDefinitionNode|InputObjectTypeDefinitionNode|undefined {
    const scalar = CORE_SCALARS.definitions.find(def => def.kind == SCALAR_TYPE_DEFINITION && def.name.value == name);
    if (scalar) {
        return scalar as ScalarTypeDefinitionNode;
    }

    if (['String', 'ID', 'Int', 'Float', 'Boolean'].includes(name)) {
        // Fake default scalar types, because they are not present in AST but will be generated later during schema creation.
        return buildScalarDefinitionNode(name);
    }
    const type = ast.definitions.find(def => (def.kind === OBJECT_TYPE_DEFINITION || def.kind === SCALAR_TYPE_DEFINITION || def.kind === ENUM_TYPE_DEFINITION || def.kind === INPUT_OBJECT_TYPE_DEFINITION) && def.name.value === name);
    if (!type) {
        return undefined;
    }
    return type as ObjectTypeDefinitionNode|ScalarTypeDefinitionNode|EnumTypeDefinitionNode;
}

export function getNamedTypeDefinitionAST(ast: DocumentNode, name: string): ObjectTypeDefinitionNode|ScalarTypeDefinitionNode|EnumTypeDefinitionNode|InputObjectTypeDefinitionNode {
    const type = getNamedTypeDefinitionASTIfExists(ast, name);
    if (!type) {
        throw new Error(`Undefined type ${name}`);
    }
    return type;
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

export function getNamedTypeNodeIgnoringNonNullAndList(typeNode: TypeNode): NamedTypeNode {
    switch (typeNode.kind) {
        case NON_NULL_TYPE:
        case LIST_TYPE:
            return getNamedTypeNodeIgnoringNonNullAndList(typeNode.type);
        case NAMED_TYPE:
            return typeNode;
    }
}

export function getNamedInputTypeDefinitionAST(ast: DocumentNode, name: string): InputObjectTypeDefinitionNode|ScalarTypeDefinitionNode {
    return ast.definitions.find(def => (def.kind === INPUT_OBJECT_TYPE_DEFINITION || def.kind === SCALAR_TYPE_DEFINITION) && def.name.value === name) as InputObjectTypeDefinitionNode|ScalarTypeDefinitionNode;
}

export function buildScalarDefinitionNode(name: string): ScalarTypeDefinitionNode {
    return {
        kind: SCALAR_TYPE_DEFINITION,
        name: { kind: NAME, value: name }
    };
}

export function buildNameNode(name: string): NameNode {
    return { kind: NAME, value: name };
}

export function findDirectiveWithName(typeOrField: TypeDefinitionNode|FieldDefinitionNode|InputValueDefinitionNode|EnumValueDefinitionNode|InputObjectTypeDefinitionNode, directiveName: string): DirectiveNode|undefined {
    // remove leading @
    if (directiveName[0] === '@') {
        directiveName = directiveName.substr(1, directiveName.length - 1);
    }
    if (!typeOrField.directives) {
        return undefined;
    }
    return typeOrField.directives.find(directive => directive.name.value === directiveName);
}

export function getDeprecationReason(node: FieldDefinitionNode | EnumValueDefinitionNode): string | undefined {
    const directive = findDirectiveWithName(node, 'deprecated');
    if (!directive || !directive.arguments) {
        return undefined;
    }
    const arg = directive.arguments.find(a => a.name.value === 'reason');
    if (!arg || arg.value.kind !== 'StringValue') {
        return undefined;
    }
    return arg.value.value;
}

export function hasDirectiveWithName(typeOrField: ObjectTypeDefinitionNode|FieldDefinitionNode|InputValueDefinitionNode, directiveName: string): boolean {
    return !!findDirectiveWithName(typeOrField, directiveName);
}

export function getNodeByName<T extends {name: NameNode}>(listOfNodes: ReadonlyArray<T>|undefined, name: string): T|undefined {
    if (!listOfNodes) {
        return undefined;
    }
    return listOfNodes.find(node => node.name.value === name);
}

export function getLineAndColumnFromPosition(position: number, source: string) {
    let curIndex = 0;
    let line = 0;
    while (curIndex < position){
        const nextLinebreakIndex = source.indexOf('\n', curIndex);
        if(nextLinebreakIndex < 0 || nextLinebreakIndex >= position){
            break;
        }else{
            line++;
            curIndex = nextLinebreakIndex+1;
        }
    }

    return {line: line+1, column: position-curIndex+1};
}

export function getLineEndPosition(targetLine: number, source: ProjectSource): SourcePosition {
    let curIndex = 0;
    let line = 0;
    let column = 0;
    while (line < targetLine){
        const nextLinebreakIndex = source.body.indexOf('\n', curIndex);
        if(nextLinebreakIndex < 0){
            break;
        }else{
            line++;
            column = nextLinebreakIndex+1-curIndex;
            curIndex = nextLinebreakIndex+1;
        }
    }

    return {line: targetLine, offset: curIndex-1, column: column};
}
