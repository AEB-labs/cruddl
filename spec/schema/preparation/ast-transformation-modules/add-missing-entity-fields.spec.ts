import {
    FieldDefinitionNode, ListTypeNode, NamedTypeNode, NonNullTypeNode, ObjectTypeDefinitionNode,
    parse
} from "graphql";
import {NonNullableListsTransformer} from "../../../../src/schema/preparation/ast-transformation-modules/non-nullable-lists";
import {LIST_TYPE, NAMED_TYPE, NON_NULL_TYPE} from "graphql/language/kinds";
import {DATETIME, ENTITY_CREATED_AT, ENTITY_ID, ENTITY_UPDATED_AT} from "../../../../src/schema/schema-defaults";
import {objectTypeFieldsWithNameOfNamedType} from "../../schema-test-utils";
import {AddMissingEntityFieldsTransformer} from "../../../../src/schema/preparation/ast-transformation-modules/add-missing-entity-fields";

const sdl = `
            type Foo @Entity {
                foo: String
            }
            
            type Bar @Entity {
                id: ID
                createdAt: DateTime
                updatedAt: DateTime
                name: String
            }
                       
            scalar DateTime

        `;

describe('add-missing-entity-fields transformer', () => {
    it('meets preconditions', () => {
        const ast = parse(sdl);

        const fooDefinition = ast.definitions[0] as ObjectTypeDefinitionNode;
        expect(objectTypeFieldsWithNameOfNamedType(fooDefinition, ENTITY_ID, 'ID').length).toBe(0);
        expect(objectTypeFieldsWithNameOfNamedType(fooDefinition, ENTITY_CREATED_AT, DATETIME).length).toBe(0);
        expect(objectTypeFieldsWithNameOfNamedType(fooDefinition, ENTITY_UPDATED_AT, DATETIME).length).toBe(0);

        const barDefinition = ast.definitions[1] as ObjectTypeDefinitionNode;
        expect(objectTypeFieldsWithNameOfNamedType(barDefinition, ENTITY_ID, 'ID').length).toBe(1);
        expect(objectTypeFieldsWithNameOfNamedType(barDefinition, ENTITY_CREATED_AT, DATETIME).length).toBe(1);
        expect(objectTypeFieldsWithNameOfNamedType(barDefinition, ENTITY_UPDATED_AT, DATETIME).length).toBe(1);
    });

    const ast = parse(sdl);
    new AddMissingEntityFieldsTransformer().transform(ast);
    const fooDefinition = ast.definitions[0] as ObjectTypeDefinitionNode;
    const barDefinition = ast.definitions[1] as ObjectTypeDefinitionNode;

    it ('adds an id', () => {
        expect(objectTypeFieldsWithNameOfNamedType(fooDefinition, ENTITY_ID, 'ID').length).toBe(1);
    });

    it ('adds a createdAt DateTime', () => {
        expect(objectTypeFieldsWithNameOfNamedType(fooDefinition, ENTITY_CREATED_AT, DATETIME).length).toBe(1);
    });

    it ('adds an updatedAt DateTime', () => {
        expect(objectTypeFieldsWithNameOfNamedType(fooDefinition, ENTITY_UPDATED_AT, DATETIME).length).toBe(1);
    });

    it ('keeps an id', () => {
        expect(objectTypeFieldsWithNameOfNamedType(barDefinition, ENTITY_ID, 'ID').length).toBe(1);
    });

    it ('keeps a createdAt DateTime', () => {
        expect(objectTypeFieldsWithNameOfNamedType(barDefinition, ENTITY_CREATED_AT, DATETIME).length).toBe(1);
    });

    it ('keeps an updatedAt DateTime', () => {
        expect(objectTypeFieldsWithNameOfNamedType(barDefinition, ENTITY_UPDATED_AT, DATETIME).length).toBe(1);
    });

});
