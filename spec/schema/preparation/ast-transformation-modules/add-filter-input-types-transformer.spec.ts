import {parse} from "graphql";
import {INPUT_OBJECT_TYPE_DEFINITION} from "graphql/language/kinds";
import {AddFilterInputTypesTransformer} from "../../../../src/schema/preparation/post-merge-ast-transformation-modules/add-filter-input-types-transformer";
import {getNamedInputTypeDefinitionAST} from "../../../../src/schema/schema-utils";

const sdl = `
            type Foo @rootEntity {
                id: ID
                createdAt: DateTime
                updatedAt: DateTime
                foo: String!
                bar: Bar
            }
            
            type Bar @embedded {
                size: Int!
                name: String
            }
            
            scalar DateTime
            
            # the next three types are not defined in AST, yet. Normally, they are created along with a new GraphQLSchema. 
            scalar String
            scalar ID
            scalar Int

        `;

describe('add-input-types', () => {
    it('meets preconditions', () => {
        const ast = parse(sdl);
        // there are no filter/input types before running the transformer.
        expect(ast.definitions.find(def => def.kind === INPUT_OBJECT_TYPE_DEFINITION)).toBeUndefined;
    });

    const ast = parse(sdl);
    new AddFilterInputTypesTransformer().transform(ast);

    it ('contains a filter type for Foo', () => {
        const fooFilter = getNamedInputTypeDefinitionAST(ast, 'FooFilter')
        expect(fooFilter).toBeDefined();
        expect(fooFilter.kind).toBe(INPUT_OBJECT_TYPE_DEFINITION);
        // TODO add more tests here.
    });

    it ('contains a filter type for Bar', () => {
        const barFilter = getNamedInputTypeDefinitionAST(ast, 'BarFilter')
        expect(barFilter).not.toBeUndefined();
        expect(barFilter.kind).toBe(INPUT_OBJECT_TYPE_DEFINITION);
        // TODO add more tests here.
    });

});
