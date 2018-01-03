import {ASTTransformer} from "../transformation-pipeline";
import {ArgumentNode, DirectiveNode, DocumentNode, ObjectTypeDefinitionNode} from "graphql";
import {buildNameNode, getNodeByName, getRootEntityTypes} from "../../schema-utils";
import {
    INDEX_DIRECTIVE, INDEX_FIELDS_FIELD, INDEX_UNIQUE_FIELD, INDICES_ARG,
    ROOT_ENTITY_DIRECTIVE, UNIQUE_DIRECTIVE
} from "../../schema-defaults";
import {ARGUMENT, BOOLEAN, LIST, OBJECT_FIELD, STRING} from "graphql/language/kinds";

export class MoveUpFieldIndicesTransformer implements ASTTransformer {

    transform(ast: DocumentNode, context?: { [p: string]: any }): void {
        getRootEntityTypes(ast).forEach(rootEntity => {
            rootEntity.fields.forEach(field => {
                const indexDirective = getNodeByName(field.directives, INDEX_DIRECTIVE);
                if (!!indexDirective) {
                    moveUpIndex(field.name.value, indexDirective, rootEntity)
                }
                const uniqueDirective = getNodeByName(field.directives, UNIQUE_DIRECTIVE);
                if (!!uniqueDirective) {
                    moveUpIndex(field.name.value, uniqueDirective, rootEntity, true)
                }
            })
        })
    }
}

function getOrCreateIndicesArg(rootEntity: ObjectTypeDefinitionNode): ArgumentNode {
    const rootEntityDirective = getNodeByName(rootEntity.directives, ROOT_ENTITY_DIRECTIVE)!;
    let indicesArg: ArgumentNode | undefined = getNodeByName(rootEntityDirective.arguments, INDICES_ARG);
    if (!indicesArg) {
        // create new arg
        indicesArg = {
            kind: ARGUMENT,
            name: buildNameNode(INDICES_ARG),
            value: {
                kind: LIST,
                values: []
            }
        };
        // add created indices arg to rootEntity
        if (!rootEntityDirective.arguments) {
            rootEntityDirective.arguments = [indicesArg];
        } else {
            rootEntityDirective.arguments.push(indicesArg);
        }
    }
    return indicesArg;
}

function moveUpIndex(fieldName: string, indexDirective: DirectiveNode, rootEntity: ObjectTypeDefinitionNode, unique?: boolean) {
    const indicesArg = getOrCreateIndicesArg(rootEntity);
    if (indicesArg.value.kind !== LIST) throw new Error(`expected list type as parameter for ${rootEntity.name.value}, got bad things.`);

    indicesArg.value.values.push({
        kind: "ObjectValue",
        fields: [
            {
                kind: OBJECT_FIELD,
                name: buildNameNode(INDEX_FIELDS_FIELD),
                value: {
                    kind: LIST,
                    values: [{
                        kind: STRING,
                        value: fieldName
                    }]
                }
            },
            {
                kind: OBJECT_FIELD,
                name: buildNameNode(INDEX_UNIQUE_FIELD),
                value: {
                    kind: BOOLEAN,
                    value: !!unique
                }
            }
        ],
        loc: indexDirective.loc
    })
}