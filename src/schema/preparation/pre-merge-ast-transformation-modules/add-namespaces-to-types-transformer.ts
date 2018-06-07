import { ASTNode, DocumentNode, ObjectTypeDefinitionNode } from 'graphql';
import { ARGUMENT, DIRECTIVE, STRING } from '../../../graphql/kinds';
import { NAMESPACE_DIRECTIVE, NAMESPACE_NAME_ARG, ROOT_ENTITY_DIRECTIVE } from '../../constants';
import { buildNameNode, hasDirectiveWithName } from '../../schema-utils';
import { ASTTransformationContext, ASTTransformer } from '../transformation-pipeline';

export class AddNamespacesToTypesTransformer implements ASTTransformer {
    transform(ast: DocumentNode, context: ASTTransformationContext): DocumentNode {
        if (!context) {
            return ast;
        }
        const namespace = context.localNamespace || context.defaultNamespace;
        if (!namespace) {
            return ast;
        }
        return {
            ...ast,
            definitions: ast.definitions.map(def => {
                if (!isObjectTypeDefinitionNode(def) || !hasDirectiveWithName(def, ROOT_ENTITY_DIRECTIVE) || hasDirectiveWithName(def, NAMESPACE_DIRECTIVE)) {
                    return def;
                }

                return {
                    ...def,
                    directives: [
                        ...def.directives,
                        ({
                            kind: DIRECTIVE,
                            name: buildNameNode(NAMESPACE_DIRECTIVE),
                            arguments: [
                                {
                                    kind: ARGUMENT,
                                    name: buildNameNode(NAMESPACE_NAME_ARG),
                                    value: {
                                        kind: STRING,
                                        value: namespace
                                    }
                                }
                            ]
                        })
                    ]
                };
            })
        };
    }
}

function isObjectTypeDefinitionNode(node: ASTNode): node is ObjectTypeDefinitionNode {
    return node.kind == 'ObjectTypeDefinition';
}
