import {ASTTransformer} from "../ast-transformer";
import {DocumentNode, ScalarTypeDefinitionNode} from "graphql";
import {NAME, SCALAR_TYPE_DEFINITION} from "graphql/language/kinds";
import {SCALAR_DATE, SCALAR_DATETIME, SCALAR_JSON, SCALAR_TIME} from "../../schema-defaults";
import {buildScalarDefinitionNode} from "../../schema-utils";

export class AddScalarTypesTransformer implements ASTTransformer {

    transform(ast: DocumentNode): void {
        ast.definitions.push(buildScalarDefinitionNode(SCALAR_DATETIME));
        ast.definitions.push(buildScalarDefinitionNode(SCALAR_DATE));
        ast.definitions.push(buildScalarDefinitionNode(SCALAR_TIME));
        ast.definitions.push(buildScalarDefinitionNode(SCALAR_JSON));
    }

}