import {ASTTransformer} from "../transformation-pipeline";
import {DocumentNode, SchemaDefinitionNode} from "graphql";
import {NAMED_TYPE, OPERATION_TYPE_DEFINITION, SCHEMA_DEFINITION} from "../../../graphql/kinds";
import {buildNameNode} from "../../schema-utils";

export class AddRootSchemaTransformer implements ASTTransformer {

    transform(ast: DocumentNode): void {
        ast.definitions.push(this.buildRootSchema(ast))
    }

    protected buildRootSchema(ast: DocumentNode): SchemaDefinitionNode {
        return {
            // fields: this.buildQueryTypeEntityFields(getRootEntityTypes(ast)),
            kind: SCHEMA_DEFINITION,
            operationTypes: [
                {
                    kind: OPERATION_TYPE_DEFINITION,
                    type: {
                        kind: NAMED_TYPE,
                        name: buildNameNode('Query'),
                    },
                    operation: "query"
                },
                {
                    kind: OPERATION_TYPE_DEFINITION,
                    type: {
                        kind: NAMED_TYPE,
                        name: buildNameNode('Mutation'),
                    },
                    operation: "mutation"
                }
            ],
            directives: []
        }
    }

}