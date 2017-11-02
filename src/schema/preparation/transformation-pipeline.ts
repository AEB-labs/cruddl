import {DocumentNode, Source} from "graphql";
import {AddMissingEntityFieldsTransformer} from "./post-merge-ast-transformation-modules/add-missing-entity-fields-transformer";
import {AddFilterInputTypesTransformer} from "./post-merge-ast-transformation-modules/add-filter-input-types-transformer";
import {AddScalarTypesTransformer} from "./post-merge-ast-transformation-modules/add-scalar-types-transformer";
import {AddRootQueryTypeTransformer} from "./post-merge-ast-transformation-modules/add-root-query-type-transformer";
import {AddRootSchemaTransformer} from "./post-merge-ast-transformation-modules/add-root-schema-transformer";
import {AddFilterArgumentsToFieldsTransformer} from "./post-merge-ast-transformation-modules/add-filter-arguments-to-fields-transformer";
import {AddOrderbyInputEnumsTransformer} from "./post-merge-ast-transformation-modules/add-orderby-enums-transformer";
import {AddOrderbyArgumentsToFieldsTransformer} from "./post-merge-ast-transformation-modules/add-orderby-arguments-to-fields-transformer";
import {AddCursorFieldToEntitiesTransformer} from "./post-merge-ast-transformation-modules/add-cursor-field-to-entities-transformer";
import {AddPaginationArgumentsToFieldsTransformer} from './post-merge-ast-transformation-modules/add-pagination-arguments-to-fields-transformer';
import {AddCreateEntityInputTypesTransformer} from "./post-merge-ast-transformation-modules/add-create-entity-input-types-transformer";
import {AddUpdateEntityInputTypesTransformer} from "./post-merge-ast-transformation-modules/add-update-entity-input-types-transformer";
import {AddExtensionInputTypesTransformer} from "./post-merge-ast-transformation-modules/add-extension-input-types-transformer";
import {AddValueObjectInputTypesTransformer} from "./post-merge-ast-transformation-modules/add-value-object-input-types-transformer";
import {AddRootMutationTypeTransformer} from "./post-merge-ast-transformation-modules/add-root-mutation-type-transformer";
import {AddMetaFieldsAlongWithFilterableFieldsTransformer} from "./post-merge-ast-transformation-modules/add-meta-fields-along-with-filterable-fields-transformer";
import {AddQueryMetaTypeTransformer} from "./post-merge-ast-transformation-modules/add-query-meta-type-transformer";
import {PropagateEntityRolesToFieldsTransformer} from './post-merge-ast-transformation-modules/propagate-entity-roles-to-fields-transformer';
import {SchemaPartConfig} from "../../config/schema-config";
import {AddNamespacesToTypesTransformer} from "./pre-merge-ast-transformation-modules/add-namespaces-to-types-transformer";

const postMergePipeline: ASTTransformer[] = [
    // Add basic stuff to object types
    new AddScalarTypesTransformer(),
    new AddMissingEntityFieldsTransformer(),
    // TODO: check if some input stuff should be nullable in schema.
    // new NonNullableListsTransformer(,

    // Complete object fields
    new PropagateEntityRolesToFieldsTransformer(),

    // add query parameters
    new AddFilterInputTypesTransformer(),
    new AddOrderbyInputEnumsTransformer(),

    // Input types for creation and manipulation of object types.
    new AddCreateEntityInputTypesTransformer(),
    new AddUpdateEntityInputTypesTransformer(),
    new AddExtensionInputTypesTransformer(),
    new AddValueObjectInputTypesTransformer(),

    // build query stuff
    new AddRootQueryTypeTransformer(),
    new AddFilterArgumentsToFieldsTransformer(),
    new AddOrderbyArgumentsToFieldsTransformer(),
    new AddCursorFieldToEntitiesTransformer(),
    new AddPaginationArgumentsToFieldsTransformer(),

    new AddQueryMetaTypeTransformer(),
    new AddMetaFieldsAlongWithFilterableFieldsTransformer(),

    // build mutation stuff
    new AddRootMutationTypeTransformer(),

    // compose schema
    new AddRootSchemaTransformer()

];

const preMergePipeline: ASTTransformer[] = [
    new AddNamespacesToTypesTransformer()
];

export function executePostMergeTransformationPipeline(ast: DocumentNode, context: {[key: string]: any}) {
    postMergePipeline.forEach(transformer => transformer.transform(ast, context));
}

export function executePreMergeTransformationPipeline(schemaParts: SchemaPartConfig[], rootContext: {[key: string]: any}) {
    schemaParts.forEach(schemaPart =>
        preMergePipeline.forEach(transformer => {
            if (schemaPart.source instanceof Source) {
                throw new Error('Expected source with DocumentType');
            }
            const { source, ...context } = schemaPart;
            transformer.transform(schemaPart.source, { ...rootContext, ...context })
        })
    ) ;
}

export interface ASTTransformer {
    transform(ast: DocumentNode, context?: {[key: string]: any}): void;
}


