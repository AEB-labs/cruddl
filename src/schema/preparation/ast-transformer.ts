import {DocumentNode} from "graphql";
import {AddMissingEntityFieldsTransformer} from "./ast-transformation-modules/add-missing-entity-fields";
import {AddFilterInputTypesTransformer} from "./ast-transformation-modules/add-filter-input-types";
import {AddScalarTypesTransformer} from "./ast-transformation-modules/add-scalar-types";
import {AddRootQueryTypeTransformer} from "./ast-transformation-modules/add-root-query-type";
import {AddRootSchemaTransformer} from "./ast-transformation-modules/add-root-schema";
import {AddFilterArgumentsToFieldsTransformer} from "./ast-transformation-modules/add-filter-arguments-to-fields";
import {AddOrderbyInputEnumsTransformer} from "./ast-transformation-modules/add-orderby-enums";
import {AddOrderbyArgumentsToFieldsTransformer} from "./ast-transformation-modules/add-orderby-arguments-to-fields";
import {AddCursorFieldToEntitiesTransformer} from "./ast-transformation-modules/add-cursor-field-to-entities";
import {AddPaginationArgumentsToFieldsTransformer} from './ast-transformation-modules/add-pagination-arguments-to-fields';
import {AddCreateEntityInputTypesTransformer} from "./ast-transformation-modules/add-create-entity-input-types";
import {AddUpdateEntityInputTypesTransformer} from "./ast-transformation-modules/add-update-entity-input-types";
import {AddExtensionInputTypesTransformer} from "./ast-transformation-modules/add-extension-input-types";
import {AddValueObjectInputTypesTransformer} from "./ast-transformation-modules/add-value-object-input-types";
import {AddRootMutationTypeTransformer} from "./ast-transformation-modules/add-root-mutation-type";
import {AddMetaFieldsAlongWithFilterableFieldsTransformer} from "./ast-transformation-modules/add-meta-fields-along-with-filterable-fields";
import {AddQueryMetaTypeTransformer} from "./ast-transformation-modules/add-query-meta-type";
import {cloneDeep} from "lodash";

const transformers = [
    // Add basic stuff to object types
    AddScalarTypesTransformer,
    AddMissingEntityFieldsTransformer,
    // TODO: check if some input stuff should be nullable in schema.
    // NonNullableListsTransformer,

    // add query parameters
    AddFilterInputTypesTransformer,
    AddOrderbyInputEnumsTransformer,

    // Input types for creation and manipulation of object types.
    AddCreateEntityInputTypesTransformer,
    AddUpdateEntityInputTypesTransformer,
    AddExtensionInputTypesTransformer,
    AddValueObjectInputTypesTransformer,

    // build query stuff
    AddRootQueryTypeTransformer,
    AddFilterArgumentsToFieldsTransformer,
    AddOrderbyArgumentsToFieldsTransformer,
    AddCursorFieldToEntitiesTransformer,
    AddPaginationArgumentsToFieldsTransformer,

    AddQueryMetaTypeTransformer,
    AddMetaFieldsAlongWithFilterableFieldsTransformer,

    // build mutation stuff
    AddRootMutationTypeTransformer,

    // compose schema
    AddRootSchemaTransformer

];

export function prepareModelAST(ast: DocumentNode): DocumentNode {
    validateModel(ast);
    return transformModel(ast);
}

function validateModel(ast: DocumentNode): void {
    // TODO
}

function transformModel(ast: DocumentNode): DocumentNode {
    // Don't modify original AST definitions because they could be already of DocumentType wrapped into a Source
    const astClone = cloneDeep(ast);
    transformers.forEach(Transformer => new Transformer().transform(astClone));
    return astClone;
}

function validateSchema(ast: DocumentNode): void {
    // TODO
}

export interface ASTTransformer {
    transform(ast: DocumentNode): void;
}