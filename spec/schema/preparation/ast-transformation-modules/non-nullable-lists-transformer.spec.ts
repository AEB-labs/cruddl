import {ListTypeNode, NonNullTypeNode, ObjectTypeDefinitionNode, parse} from "graphql";
import {NonNullableListsTransformer} from "../../../../src/schema/preparation/post-merge-ast-transformation-modules/non-nullable-lists-transformer";
import {LIST_TYPE, NAMED_TYPE, NON_NULL_TYPE} from "graphql/language/kinds";

const sdl1 = `
            type Stuff {
                foo: String
                bar: Int!
                baz: [ListElementStuff]
            }
            type ListElementStuff {
                name: String
            }
        `;

const sdl2 = `
            type Stuff {
                foo: String
                bar: Int!
                baz: [ListElementStuff]!
            }
            type ListElementStuff {
                name: String
            }
        `;

const sdl3 = `
            type Stuff {
                foo: String
                bar: Int!
                baz: [ListElementStuff!]
            }
            type ListElementStuff {
                name: String
            }
        `;

const sdl4 = `
            type Stuff {
                foo: String
                bar: Int!
                baz: [ListElementStuff!]!
            }

            type ListElementStuff {
                name: String
            }
        `;

describe('non-nullable-lists transformer', () => {
    it ('keep non list types', () => {
        const ast = parse(sdl1);
        const stuffDefinition = ast.definitions[0] as ObjectTypeDefinitionNode;
        const listElementStuffDefinition = ast.definitions[1] as ObjectTypeDefinitionNode;
        // check old ast
        expect(listElementStuffDefinition.fields[0].type.kind).toBe(NAMED_TYPE);
    });

    it('transforms [ListElem]', () => {
        const ast = parse(sdl1);
        const stuffDefinition = ast.definitions[0] as ObjectTypeDefinitionNode;
        const listElementStuffDefinition = ast.definitions[1] as ObjectTypeDefinitionNode;
        // check old ast
        expect(stuffDefinition.fields[2].type.kind).toBe(LIST_TYPE);
        expect((<ListTypeNode>stuffDefinition.fields[2].type).type.kind).toBe(NAMED_TYPE);

        // check new ast
        new NonNullableListsTransformer().transform(ast);
        const stuffDefinitionNew = ast.definitions[0] as ObjectTypeDefinitionNode;
        const listElementStuffDefinitionNew = ast.definitions[1] as ObjectTypeDefinitionNode;

        // remains the same, non-list types will not be touched.
        expect(listElementStuffDefinitionNew.fields[0].type.kind).toBe(NAMED_TYPE);

        expect(stuffDefinitionNew.fields[2].type.kind).toBe(NON_NULL_TYPE);
        expect((<NonNullTypeNode>stuffDefinitionNew.fields[2].type).type.kind).toBe(LIST_TYPE);
        expect((<ListTypeNode>(<NonNullTypeNode>stuffDefinitionNew.fields[2].type).type).type.kind).toBe(NON_NULL_TYPE);

    });

    it('transforms [ListElem]!', () => {
        const ast = parse(sdl2);
        new NonNullableListsTransformer().transform(ast);
        const stuffDefinitionNew = ast.definitions[0] as ObjectTypeDefinitionNode;
        const listElementStuffDefinitionNew = ast.definitions[1] as ObjectTypeDefinitionNode;

        // remains the same, non-list types will not be touched.
        expect(listElementStuffDefinitionNew.fields[0].type.kind).toBe(NAMED_TYPE);

        expect(stuffDefinitionNew.fields[2].type.kind).toBe(NON_NULL_TYPE);
        expect((<NonNullTypeNode>stuffDefinitionNew.fields[2].type).type.kind).toBe(LIST_TYPE);
        expect((<ListTypeNode>(<NonNullTypeNode>stuffDefinitionNew.fields[2].type).type).type.kind).toBe(NON_NULL_TYPE);

    });

    it('transforms [ListElem!]', () => {
        const ast = parse(sdl3);
        new NonNullableListsTransformer().transform(ast);
        const stuffDefinitionNew = ast.definitions[0] as ObjectTypeDefinitionNode;
        const listElementStuffDefinitionNew = ast.definitions[1] as ObjectTypeDefinitionNode;

        // remains the same, non-list types will not be touched.
        expect(listElementStuffDefinitionNew.fields[0].type.kind).toBe(NAMED_TYPE);

        expect(stuffDefinitionNew.fields[2].type.kind).toBe(NON_NULL_TYPE);
        expect((<NonNullTypeNode>stuffDefinitionNew.fields[2].type).type.kind).toBe(LIST_TYPE);
        expect((<ListTypeNode>(<NonNullTypeNode>stuffDefinitionNew.fields[2].type).type).type.kind).toBe(NON_NULL_TYPE);

    });

    it('keeps [ListElem!]!', () => {
        const ast = parse(sdl4);
        new NonNullableListsTransformer().transform(ast);
        const stuffDefinitionNew = ast.definitions[0] as ObjectTypeDefinitionNode;
        const listElementStuffDefinitionNew = ast.definitions[1] as ObjectTypeDefinitionNode;

        // remains the same, non-list types will not be touched.
        expect(listElementStuffDefinitionNew.fields[0].type.kind).toBe(NAMED_TYPE);

        expect(stuffDefinitionNew.fields[2].type.kind).toBe(NON_NULL_TYPE);
        expect((<NonNullTypeNode>stuffDefinitionNew.fields[2].type).type.kind).toBe(LIST_TYPE);
        expect((<ListTypeNode>(<NonNullTypeNode>stuffDefinitionNew.fields[2].type).type).type.kind).toBe(NON_NULL_TYPE);

    });

});
