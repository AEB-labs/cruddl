import {ASTTransformer} from "../transformation-pipeline";
import {DocumentNode} from "graphql";
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