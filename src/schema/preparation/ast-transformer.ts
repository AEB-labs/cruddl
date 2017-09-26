import {DocumentNode} from "graphql";
import {AddMissingEntityFieldsTransformer} from "./ast-transformation-modules/add-missing-entity-fields";
import {NonNullableListsTransformer} from "./ast-transformation-modules/non-nullable-lists";
import {AddFilterInputTypesTransformer} from "./ast-transformation-modules/add-filter-input-types";
import {AddScalarTypesTransformer} from "./ast-transformation-modules/add-scalar-types";
import {AddRootQueryTypeTransformer} from "./ast-transformation-modules/add-root-query-type";
import {AddRootSchemaTransformer} from "./ast-transformation-modules/add-root-schema";
import {AddFilterArgumentsToFieldsTransformer} from "./ast-transformation-modules/add-filter-arguments-to-fields";
import {AddOrderbyInputEnumsTransformer} from "./ast-transformation-modules/add-orderby-enums";
import {AddOrderbyArgumentsToFieldsTransformer} from "./ast-transformation-modules/add-orderby-arguments-to-fields";
import {AddCursorFieldToEntitiesTransformer} from "../../../spec/schema/preparation/ast-transformation-modules/add-cursor-field-to-entities";
import { AddPaginationArgumentsToFieldsTransformer } from './ast-transformation-modules/add-pagination-arguments-to-fields';

const transformers = [
    AddScalarTypesTransformer,
    AddMissingEntityFieldsTransformer,
    NonNullableListsTransformer,
    AddFilterInputTypesTransformer,
    AddRootSchemaTransformer,
    AddOrderbyInputEnumsTransformer,
    AddRootQueryTypeTransformer,
    AddFilterArgumentsToFieldsTransformer,
    AddOrderbyArgumentsToFieldsTransformer,
    AddPaginationArgumentsToFieldsTransformer,
    AddCursorFieldToEntitiesTransformer
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