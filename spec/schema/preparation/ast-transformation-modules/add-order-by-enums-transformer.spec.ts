import {parse} from "graphql";
import {ENUM_TYPE_DEFINITION, INPUT_OBJECT_TYPE_DEFINITION} from "../../../../src/graphql/kinds";
import {AddFilterInputTypesTransformer} from "../../../../src/schema/preparation/post-merge-ast-transformation-modules/add-filter-input-types-transformer";
import {getNamedInputTypeDefinitionAST, getNamedTypeDefinitionAST} from "../../../../src/schema/schema-utils";
import {AddOrderbyInputEnumsTransformer} from "../../../../src/schema/preparation/post-merge-ast-transformation-modules/add-orderby-enums-transformer";
import { expect } from 'chai';

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

describe('add-order-by-enums', () => {
    it('meets preconditions', () => {
        const ast = parse(sdl);
        // there are no filter/input types before running the transformer.
        expect(ast.definitions.find(def => def.kind === ENUM_TYPE_DEFINITION)).to.be.undefined;
    });

    const ast = parse(sdl);
    new AddOrderbyInputEnumsTransformer().transform(ast);

    it ('contains an enum for Foo', () => {
        const fooOrderByEnum = getNamedTypeDefinitionAST(ast, 'FooOrderBy');
        expect(fooOrderByEnum).not.to.be.undefined;
        expect(fooOrderByEnum.kind).to.equal(ENUM_TYPE_DEFINITION);
        // TODO add more tests here.
    });

    it ('contains an enum for Bar', () => {
        const barOrderByEnum = getNamedTypeDefinitionAST(ast, 'BarOrderBy');
        expect(barOrderByEnum).to.not.be.undefined;
        expect(barOrderByEnum.kind).to.equal(ENUM_TYPE_DEFINITION);
        // TODO add more tests here.
    });

});
