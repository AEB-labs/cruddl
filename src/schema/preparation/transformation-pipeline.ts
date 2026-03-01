import { DocumentNode } from 'graphql';
import { ProjectOptions } from '../../config/interfaces.js';
import { ParsedProject, ParsedProjectSourceBaseKind } from '../../config/parsed-project.js';
import { DatabaseAdapter } from '../../database/database-adapter.js';
import { AddNamespacesToTypesTransformer } from './pre-merge-ast-transformation-modules/add-namespaces-to-types-transformer.js';

const preMergePipeline: ReadonlyArray<ASTTransformer> = [new AddNamespacesToTypesTransformer()];

export function executePreMergeTransformationPipeline(parsedProject: ParsedProject): ParsedProject {
    return {
        sources: parsedProject.sources.map((source) => {
            // don't transform object sources
            if (source.kind !== ParsedProjectSourceBaseKind.GRAPHQL) {
                return source;
            }
            let document = source.document;
            for (const transformer of preMergePipeline) {
                document = transformer.transform(document, { namespacePath: source.namespacePath });
            }
            return {
                ...source,
                document,
            };
        }),
    };
}

export interface ASTTransformationContext {
    namespacePath: ReadonlyArray<string>;
}

export interface SchemaTransformationContext extends ProjectOptions {
    databaseAdapter: DatabaseAdapter;
}

export interface ASTTransformer {
    transform(ast: DocumentNode, context: ASTTransformationContext): DocumentNode;
}
