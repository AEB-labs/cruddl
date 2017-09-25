import {NamedTypeNode, ObjectTypeDefinitionNode, parse} from "graphql";
import {NAMED_TYPE, OBJECT_TYPE_DEFINITION} from "graphql/language/kinds";
import {FILTER_ARG} from "../../../../src/schema/schema-defaults";
import {AddFilterArgumentsToFieldsTransformer} from "../../../../src/schema/preparation/ast-transformation-modules/add-filter-arguments-to-fields";

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

            type Query {
                allFoos: [Foo!]!
            }
            
            schema {
                query: Query
            }
            
            input FooFilter {
                bla: String
            }
        `;

describe('add-filter-arguments-to-fields', () => {
    it('meets preconditions', () => {
        const ast = parse(sdl);
        // there are no filter arguments before running the transformer.
        const queryType: ObjectTypeDefinitionNode = ast.definitions.find(def => def.kind === OBJECT_TYPE_DEFINITION && def.name.value === 'Query') as ObjectTypeDefinitionNode;
        const allFoosField = queryType.fields.find(field => field.name.value === 'allFoos');
        const filterArg = allFoosField!.arguments.find(arg => arg.name.value === FILTER_ARG);
        expect(filterArg).toBeUndefined();
    });

    const ast = parse(sdl);
    new AddFilterArgumentsToFieldsTransformer().transform(ast);

    it ('adds a new arg `filter` to Query.allFoos() of type FooFooFilter', () => {
        const queryType: ObjectTypeDefinitionNode = ast.definitions.find(def => def.kind === OBJECT_TYPE_DEFINITION && def.name.value === 'Query') as ObjectTypeDefinitionNode;
        const allFoosField = queryType.fields.find(field => field.name.value === 'allFoos');
        const filterArg = allFoosField!.arguments.find(arg => arg.name.value === FILTER_ARG);
        expect(filterArg).toBeDefined();
        expect(filterArg!.type.kind).toBe(NAMED_TYPE);
        expect((filterArg!.type as NamedTypeNode).name.value).toBe('FooFilter');
    });

});
