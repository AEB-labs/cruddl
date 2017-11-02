import {ASTTransformer} from "../transformation-pipeline";
import {DocumentNode} from "graphql";
import {buildNameNode, getRootEntityTypes, hasDirectiveWithName} from "../../schema-utils";
import {ARGUMENT, DIRECTIVE, STRING} from "graphql/language/kinds";
import {NAMESPACE_DIRECTIVE, NAMESPACE_NAME_ARG} from "../../schema-defaults";

export class AddNamespacesToTypesTransformer implements ASTTransformer {

    transform(ast: DocumentNode, context: {[key: string]: any}): void {
        if (!context) {
            return;
        }
        const namespace = context['localNamespace'] || context['defaultNamespace'];
        if (!namespace) {
            return;
        }
        getRootEntityTypes(ast).forEach(rootEntityType => {
            if (!hasDirectiveWithName(rootEntityType, 'namespace')) {
                rootEntityType.directives = [
                    ...rootEntityType.directives || [],
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
            }
        })

    }

}