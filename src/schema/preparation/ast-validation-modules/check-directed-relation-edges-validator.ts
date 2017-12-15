import {ASTValidator} from "../ast-validator";
import {DocumentNode, FieldDefinitionNode, Location, ObjectTypeDefinitionNode} from "graphql";
import {ValidationMessage} from "../validation-message";
import {
    findDirectiveWithName,
    getNodeByName,
    getRootEntityTypes,
    getTypeNameIgnoringNonNullAndList
} from "../../schema-utils";
import {INVERSE_OF_ARG, RELATION_DIRECTIVE} from "../../schema-defaults";
import {STRING} from "graphql/language/kinds";

export const VALIDATION_ERROR_INVALID_ARGUMENT_TYPE = 'Invalid argument type.';
export const VALIDATION_ERROR_INVERSE_FIELD_NOT_FOUND = `Field specified in ${INVERSE_OF_ARG} argument not found on the other side`;
export const VALIDATION_WARNING_UNASSOCIATED_RELATIONS = 'In this type, there is a relation to the other type and in the other type, there is a relation to this type. None of them is declared as inverseOf the other one. This is possibly a miss-configuration and leads to independent relations. ATTENTION: When editing an existing relation, always add the inverseOf argument to the @relation which was created last.';
class EdgeSide {
    constructor(
        readonly localType: ObjectTypeDefinitionNode,
        readonly localField: FieldDefinitionNode,
        readonly remoteType: string,
        readonly inverseOf?: string,
        readonly loc?: Location) {}
}

export class CheckDirectedRelationEdgesValidator implements ASTValidator {


    validate(ast: DocumentNode): ValidationMessage[] {
        const validationMessages: ValidationMessage[] = [];

        const startingEdges: EdgeSide[] = [];
        const endingEdges: EdgeSide[] = [];


        getRootEntityTypes(ast).forEach(rootEntity => {
            rootEntity.fields.forEach(field => {
                const relationDirective = findDirectiveWithName(field, RELATION_DIRECTIVE);
                if (!relationDirective) {
                    return;
                }
                const inverseOfArg = getNodeByName(relationDirective.arguments, INVERSE_OF_ARG);
                if (inverseOfArg) {
                    if (inverseOfArg.value.kind !== STRING) {
                        validationMessages.push(ValidationMessage.error(VALIDATION_ERROR_INVALID_ARGUMENT_TYPE, {
                            expected: STRING,
                            actual: inverseOfArg.value.kind
                        }, inverseOfArg.value.loc))
                    } else {
                        endingEdges.push(new EdgeSide(rootEntity, field, getTypeNameIgnoringNonNullAndList(field.type), inverseOfArg.value.value, relationDirective.loc))
                    }
                } else {
                    startingEdges.push(new EdgeSide(rootEntity, field, getTypeNameIgnoringNonNullAndList(field.type), undefined, relationDirective.loc))
                }
            })
        });
        matchStartingAndEndingEdges(startingEdges, endingEdges, ast, validationMessages);
        return validationMessages;
    }
}

function matchStartingAndEndingEdges(startingEdges: EdgeSide[], endingEdges: EdgeSide[], ast: DocumentNode, validationMessages: ValidationMessage[]) {
    // Remove pairs of starting and ending edges.
    endingEdges.forEach(endingEdge => {
        const matchingStartingEdge = startingEdges.find(startingEdge =>
            startingEdge.localField.name.value === endingEdge.inverseOf
            && startingEdge.localType.name.value === endingEdge.remoteType);
        if (matchingStartingEdge) {
            startingEdges = startingEdges.filter(se => se !== matchingStartingEdge);
            endingEdges = endingEdges.filter(ee => ee !== endingEdge);
        } else {
            const messageVars = { localType: endingEdge.localType.name.value, localField: endingEdge.localField.name.value, inverseOf: endingEdge.inverseOf || '' };
            validationMessages.push(ValidationMessage.error(VALIDATION_ERROR_INVERSE_FIELD_NOT_FOUND, messageVars, endingEdge.loc));
        }
    });
    // Now, check if there are starting edges which could be miss-configured (due to missing inverseOf)
    startingEdges.forEach(edge1 => {
        startingEdges.forEach(edge2 => {
            if (edge1.remoteType === edge2.localType.name.value
                && edge2.remoteType === edge1.localType.name.value) {
                validationMessages.push(ValidationMessage.warn(VALIDATION_WARNING_UNASSOCIATED_RELATIONS, { localType: edge1.localType.name.value, localField: edge1.localField.name.value }, edge1.loc));
            }
        })
    })
}
