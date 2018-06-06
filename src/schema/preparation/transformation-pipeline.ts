import { DocumentNode, GraphQLSchema, Source } from 'graphql';
import { SchemaContext } from '../../config/global';
import { SchemaPartConfig } from '../../config/schema-config';
import { DatabaseAdapter } from '../../database/database-adapter';
import { Model, PermissionProfileMap } from '../../model';
import { AddNamespacesToTypesTransformer } from './pre-merge-ast-transformation-modules/add-namespaces-to-types-transformer';
import { AddRuntimeErrorResolversTransformer } from './schema-transformation-modules/add-runtime-error-resolvers';

const preMergePipeline: ASTTransformer[] = [
    new AddNamespacesToTypesTransformer()
];

const schemaPipeline: SchemaTransformer[] = [
    new AddRuntimeErrorResolversTransformer()
];

export function executePreMergeTransformationPipeline(schemaParts: SchemaPartConfig[], rootContext: ASTTransformationContext, model: Model) {
    schemaParts.forEach(schemaPart =>
        preMergePipeline.forEach(transformer => {
            if (schemaPart.document instanceof Source) {
                throw new Error('Expected source with DocumentType');
            }
            const { document, ...context } = schemaPart;
            transformer.transform(schemaPart.document, { ...rootContext, ...context }, model)
        })
    ) ;
}

export function executeSchemaTransformationPipeline(schema: GraphQLSchema, context: SchemaTransformationContext, model: Model): GraphQLSchema {
    return schemaPipeline.reduce((s, transformer) => transformer.transform(s, context, model), schema);
}

export interface ASTTransformationContext {
    defaultNamespace?: string
    localNamespace?: string
    permissionProfiles?: PermissionProfileMap
}

export interface SchemaTransformationContext extends ASTTransformationContext, SchemaContext {
    databaseAdapter: DatabaseAdapter

}

export interface ASTTransformer {
    transform(ast: DocumentNode, context: ASTTransformationContext, model: Model): void;
}

export interface SchemaTransformer {
    transform(schema: GraphQLSchema, context: SchemaTransformationContext, model: Model): GraphQLSchema;
}
