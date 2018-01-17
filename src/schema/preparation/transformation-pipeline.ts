import {DocumentNode, GraphQLSchema, Source} from 'graphql';
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
import {SchemaPartConfig} from "../../config/schema-config";
import {AddNamespacesToTypesTransformer} from "./pre-merge-ast-transformation-modules/add-namespaces-to-types-transformer";
import {PermissionProfileMap} from '../../authorization/permission-profile';
import {AddPermissionDescriptorsTransformer} from './post-merge-ast-transformation-modules/add-permission-descriptors';
import {MoveUpFieldIndicesTransformer} from "./pre-merge-ast-transformation-modules/move-up-field-indices-transformer";
import {ImplementScalarTypesTransformer} from './schema-transformation-modules/implement-scalar-types';

const preMergePipeline: ASTTransformer[] = [
    new AddNamespacesToTypesTransformer(),
    new MoveUpFieldIndicesTransformer()
];

const postMergePipeline: ASTTransformer[] = [
    // Add basic stuff to object types
    new AddScalarTypesTransformer(),
    new AddMissingEntityFieldsTransformer(),
    // TODO: check if some input stuff should be nullable in schema.
    // new NonNullableListsTransformer(,

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

    new AddPermissionDescriptorsTransformer(),

    // compose schema
    new AddRootSchemaTransformer()

];

const schemaPipeline: SchemaTransformer[] = [
    new ImplementScalarTypesTransformer(),
];

export function executePostMergeTransformationPipeline(ast: DocumentNode, context: ASTTransformationContext) {
    postMergePipeline.forEach(transformer => transformer.transform(ast, context));
}

export function executePreMergeTransformationPipeline(schemaParts: SchemaPartConfig[], rootContext: ASTTransformationContext) {
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

export function executeSchemaTransformationPipeline(schema: GraphQLSchema): GraphQLSchema {
    return schemaPipeline.reduce((s, transformer) => transformer.transform(s), schema);
}

export interface ASTTransformationContext {
    defaultNamespace?: string
    localNamespace?: string
    permissionProfiles?: PermissionProfileMap
}

export interface ASTTransformer {
    transform(ast: DocumentNode, context: ASTTransformationContext): void;
}

export interface SchemaTransformer {
    transform(schema: GraphQLSchema): GraphQLSchema;
}
