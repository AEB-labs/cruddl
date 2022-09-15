import { ASTNode, DocumentNode, Kind, ObjectTypeDefinitionNode } from 'graphql';
import {
    NAMESPACE_DIRECTIVE,
    NAMESPACE_NAME_ARG,
    NAMESPACE_SEPARATOR,
    ROOT_ENTITY_DIRECTIVE,
} from '../../constants';
import { buildNameNode, hasDirectiveWithName } from '../../schema-utils';
import { ASTTransformationContext, ASTTransformer } from '../transformation-pipeline';

export class AddNamespacesToTypesTransformer implements ASTTransformer {
    transform(ast: DocumentNode, context: ASTTransformationContext): DocumentNode {
        if (!context || !context.namespacePath || context.namespacePath.length === 0) {
            return ast;
        }
        return {
            ...ast,
            definitions: ast.definitions.map((def) => {
                if (
                    !isObjectTypeDefinitionNode(def) ||
                    !hasDirectiveWithName(def, ROOT_ENTITY_DIRECTIVE) ||
                    hasDirectiveWithName(def, NAMESPACE_DIRECTIVE)
                ) {
                    return def;
                }

                return {
                    ...def,
                    directives: [
                        ...(def.directives ? def.directives : []),
                        {
                            kind: Kind.DIRECTIVE,
                            name: buildNameNode(NAMESPACE_DIRECTIVE),
                            arguments: [
                                {
                                    kind: Kind.ARGUMENT,
                                    name: buildNameNode(NAMESPACE_NAME_ARG),
                                    value: {
                                        kind: Kind.STRING,
                                        value: context.namespacePath.join(NAMESPACE_SEPARATOR),
                                    },
                                },
                            ],
                        },
                    ],
                };
            }),
        };
    }
}

function isObjectTypeDefinitionNode(node: ASTNode): node is ObjectTypeDefinitionNode {
    return node.kind == 'ObjectTypeDefinition';
}
