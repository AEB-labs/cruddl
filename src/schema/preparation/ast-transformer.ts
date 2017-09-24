import {DocumentNode} from "graphql";
import {AddMissingEntityFieldsTransformer} from "./ast-transformation-modules/add-missing-entity-fields";
import {NonNullableListsTransformer} from "./ast-transformation-modules/non-nullable-lists";
import {AddFilterInputTypesTransformer} from "./ast-transformation-modules/add-filter-input-types";
import {AddScalarTypesTransformer} from "./ast-transformation-modules/add-scalar-types";
import {AddRootQueryTypeTransformer} from "./ast-transformation-modules/add-root-query-type";
import {AddRootSchemaTransformer} from "./ast-transformation-modules/add-root-schema";
import {AddFilterArgumentsToFieldsTransformer} from "./ast-transformation-modules/add-filter-arguments-to-fields";

const transformers = [
    AddScalarTypesTransformer,
    AddMissingEntityFieldsTransformer,
    NonNullableListsTransformer,
    AddFilterInputTypesTransformer,
    AddRootSchemaTransformer,
    AddRootQueryTypeTransformer,
    AddFilterArgumentsToFieldsTransformer
];

export function prepareModelAST(ast: DocumentNode) {
    validateModel(ast);
    transformModel(ast);
}

function validateModel(ast: DocumentNode): void {
    // TODO
}

function transformModel(ast: DocumentNode): void {
    transformers.forEach(Transformer => new Transformer().transform(ast))
}

function validateSchema(ast: DocumentNode): void {
    // TODO
}

export interface ASTTransformer {
    transform(ast: DocumentNode): void;
}