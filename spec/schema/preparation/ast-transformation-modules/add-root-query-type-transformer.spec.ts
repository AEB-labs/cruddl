import {ObjectTypeDefinitionNode, parse} from "graphql";
import {OBJECT_TYPE_DEFINITION} from "../../../../src/graphql/kinds";
import {getNamedTypeDefinitionAST} from "../../../../src/schema/schema-utils";
import {AddRootQueryTypeTransformer} from "../../../../src/schema/preparation/post-merge-ast-transformation-modules/add-root-query-type-transformer";

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

describe('add-root-query-type', () => {
    it('meets preconditions', () => {
        const ast = parse(sdl);
        // there are no filter/input types before running the transformer.
        expect(ast.definitions.find(def => def.kind === OBJECT_TYPE_DEFINITION && def.name.value === 'Query')).toBeUndefined();
    });

    const ast = parse(sdl);
    new AddRootQueryTypeTransformer().transform(ast);

    it ('contains an object type called Query', () => {
        const queryType = getNamedTypeDefinitionAST(ast, 'Query')
        expect(queryType).toBeDefined();
        expect(queryType.kind).toBe(OBJECT_TYPE_DEFINITION);
        expect((<ObjectTypeDefinitionNode> queryType).fields.find(field => field.name.value === 'Foo')).toBeDefined();
        expect((<ObjectTypeDefinitionNode> queryType).fields.find(field => field.name.value === 'allFoos')).toBeDefined();
        // Bar is an embedded type => no root fields for Bar
        expect((<ObjectTypeDefinitionNode> queryType).fields.find(field => field.name.value === 'Bar')).toBeUndefined();
        expect((<ObjectTypeDefinitionNode> queryType).fields.find(field => field.name.value === 'allBar')).toBeUndefined();

        // TODO add more tests here.
    });

});
