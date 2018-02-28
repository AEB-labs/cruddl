import {ListTypeNode, NamedTypeNode, NonNullTypeNode, ObjectTypeDefinitionNode, parse} from "graphql";
import {LIST_TYPE, NAMED_TYPE, NON_NULL_TYPE, OBJECT_TYPE_DEFINITION} from "../../../../src/graphql/kinds";
import {ORDER_BY_ARG} from "../../../../src/schema/schema-defaults";
import {AddOrderbyArgumentsToFieldsTransformer} from "../../../../src/schema/preparation/post-merge-ast-transformation-modules/add-orderby-arguments-to-fields-transformer";

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

            type Query {
                allFoos: [Foo!]!
            }
            
            schema {
                query: Query
            }
            
            enum FooOrderBy {
                A, B, C
            }
        `;

describe('add-orderby-arguments-to-fields', () => {
    it('meets preconditions', () => {
        const ast = parse(sdl);
        // there are no orderBy arguments before running the transformer.
        const queryType: ObjectTypeDefinitionNode = ast.definitions.find(def => def.kind === OBJECT_TYPE_DEFINITION && def.name.value === 'Query') as ObjectTypeDefinitionNode;
        const allFoosField = queryType.fields.find(field => field.name.value === 'allFoos');
        const orderByArg = allFoosField!.arguments.find(arg => arg.name.value === ORDER_BY_ARG);
        expect(orderByArg).toBeUndefined();
    });

    const ast = parse(sdl);
    new AddOrderbyArgumentsToFieldsTransformer().transform(ast);

    it ('adds a new arg `order by` to Query.allFoos() of type FooOrderBy', () => {
        const queryType: ObjectTypeDefinitionNode = ast.definitions.find(def => def.kind === OBJECT_TYPE_DEFINITION && def.name.value === 'Query') as ObjectTypeDefinitionNode;
        const allFoosField = queryType.fields.find(field => field.name.value === 'allFoos');
        const orderByArg = allFoosField!.arguments.find(arg => arg.name.value === ORDER_BY_ARG);
        expect(orderByArg).toBeDefined();
        expect(orderByArg!.type.kind).toBe(LIST_TYPE);
        expect((orderByArg!.type as ListTypeNode).type.kind).toBe(NON_NULL_TYPE);
        expect((((orderByArg!.type as ListTypeNode).type) as NonNullTypeNode).type.kind).toBe(NAMED_TYPE);
        expect(((((orderByArg!.type as ListTypeNode).type) as NonNullTypeNode).type as NamedTypeNode).name.value).toBe('FooOrderBy');
    });

});
