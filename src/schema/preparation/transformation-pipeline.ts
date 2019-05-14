import { DocumentNode, GraphQLSchema } from 'graphql';
import { SchemaContext } from '../../config/interfaces';
import { ParsedProject, ParsedProjectSourceBaseKind } from '../../config/parsed-project';
import { DatabaseAdapter } from '../../database/database-adapter';
import { Model } from '../../model';
import { AddNamespacesToTypesTransformer } from './pre-merge-ast-transformation-modules/add-namespaces-to-types-transformer';
import { AddRuntimeErrorResolversTransformer } from './schema-transformation-modules/add-runtime-error-resolvers';

const preMergePipeline: ASTTransformer[] = [
    new AddNamespacesToTypesTransformer()
];

const schemaPipeline: SchemaTransformer[] = [
    new AddRuntimeErrorResolversTransformer()
];

export function executePreMergeTransformationPipeline(parsedProject: ParsedProject): ParsedProject {
    return {
        sources: parsedProject.sources.map((source) => {
            // don't transform object sources
            if (source.kind !== ParsedProjectSourceBaseKind.GRAPHQL) {
                return source
            }
            let document = source.document;
            for (const transformer of preMergePipeline) {
                document = transformer.transform(document, { namespacePath: source.namespacePath });
            }
            return {
                ...source,
                document
            };
        })
    };
}

export function executeSchemaTransformationPipeline(schema: GraphQLSchema, context: SchemaTransformationContext, model: Model): GraphQLSchema {
    return schemaPipeline.reduce((s, transformer) => transformer.transform(s, context, model), schema);
}

export interface ASTTransformationContext {
    namespacePath: ReadonlyArray<string>
}

export interface SchemaTransformationContext extends SchemaContext {
    databaseAdapter: DatabaseAdapter

}

export interface ASTTransformer {
    transform(ast: DocumentNode, context: ASTTransformationContext): DocumentNode;
}

export interface SchemaTransformer {
    transform(schema: GraphQLSchema, context: SchemaTransformationContext, model: Model): GraphQLSchema;
}
