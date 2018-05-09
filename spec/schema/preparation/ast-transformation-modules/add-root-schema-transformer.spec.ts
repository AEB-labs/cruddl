import {parse, SchemaDefinitionNode} from "graphql";
import {SCHEMA_DEFINITION} from "../../../../src/graphql/kinds";
import {AddRootSchemaTransformer} from "../../../../src/schema/preparation/post-merge-ast-transformation-modules/add-root-schema-transformer";
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

describe('add-root-schema', () => {
    it('meets preconditions', () => {
        const ast = parse(sdl);
        // there are no filter/input types before running the transformer.
        expect(ast.definitions.find(def => def.kind === SCHEMA_DEFINITION)).to.be.undefined;
    });

    const ast = parse(sdl);
    new AddRootSchemaTransformer().transform(ast);

    it ('contains a schema', () => {
        const schema = <SchemaDefinitionNode> ast.definitions.find(def => def.kind === SCHEMA_DEFINITION);
        expect(schema).to.not.be.undefined;
        // check for a query operation type
        expect(schema.operationTypes.find(opType => opType.operation === 'query')).to.be.undefined;
    });

});
