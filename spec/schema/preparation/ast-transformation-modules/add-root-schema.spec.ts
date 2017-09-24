import {parse, SchemaDefinitionNode} from "graphql";
import {SCHEMA_DEFINITION} from "graphql/language/kinds";
import {AddRootSchemaTransformer} from "../../../../src/schema/preparation/ast-transformation-modules/add-root-schema";

const sdl = `
            type Foo @entity {
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

describe('add-root-schema', () => {
    it('meets preconditions', () => {
        const ast = parse(sdl);
        // there are no filter/input types before running the transformer.
        expect(ast.definitions.find(def => def.kind === SCHEMA_DEFINITION)).toBeUndefined();
    });

    const ast = parse(sdl);
    new AddRootSchemaTransformer().transform(ast);

    it ('contains a schema', () => {
        const schema = <SchemaDefinitionNode> ast.definitions.find(def => def.kind === SCHEMA_DEFINITION);
        expect(schema).toBeDefined();
        // check for a query operation type
        expect(schema.operationTypes.find(opType => opType.operation === 'query')).toBeDefined();
    });

});
