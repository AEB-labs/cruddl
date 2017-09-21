import {DocumentNode} from "graphql";
import {AddMissingEntityFieldsTransformer} from "./ast-transformation-modules/add-missing-entity-fields";
import {NonNullableListsTransformer} from "./ast-transformation-modules/non-nullable-lists";

const transformers = [
    AddMissingEntityFieldsTransformer,
    NonNullableListsTransformer
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