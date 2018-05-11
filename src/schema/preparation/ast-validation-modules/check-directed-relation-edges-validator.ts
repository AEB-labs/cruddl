import {ASTValidator} from "../ast-validator";
import {DocumentNode, FieldDefinitionNode, Location, ObjectTypeDefinitionNode} from "graphql";
import {ValidationMessage} from "../../../model/validation/message";
import {
    findDirectiveWithName,
    getNodeByName,
    getRootEntityTypes,
    getTypeNameIgnoringNonNullAndList
} from "../../schema-utils";
import {INVERSE_OF_ARG, RELATION_DIRECTIVE} from "../../schema-defaults";
import {STRING} from "../../../graphql/kinds";

export const VALIDATION_ERROR_INVALID_ARGUMENT_TYPE = 'Invalid argument type.';

class EdgeSide {
    constructor(
        readonly localType: ObjectTypeDefinitionNode,
        readonly localField: FieldDefinitionNode,
        readonly remoteType: string,
        readonly inverseOf?: string,
        readonly loc?: Location,
        readonly inverseOfArgValueLoc?: Location) {}
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
                        endingEdges.push(new EdgeSide(rootEntity, field, getTypeNameIgnoringNonNullAndList(field.type), inverseOfArg.value.value, relationDirective.loc, inverseOfArg.value.loc))
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
            validationMessages.push(ValidationMessage.error(`Type "${endingEdge.remoteType}" does not have a field "${endingEdge.inverseOf}"`, messageVars, endingEdge.inverseOfArgValueLoc));
        }
    });
    // Now, check if there are starting edges which could be miss-configured (due to missing inverseOf)
    startingEdges.forEach(edge1 => {
        startingEdges.forEach(edge2 => {
            if (edge1.remoteType === edge2.localType.name.value
                && edge2.remoteType === edge1.localType.name.value) {
                validationMessages.push(ValidationMessage.warn(`This field and "${edge1.remoteType}.${edge2.localField.name.value}" define separate relations. Consider using the "inverseOf" argument to add a backlink to an existing relation`,
                    { localType: edge1.localType.name.value, localField: edge1.localField.name.value }, edge1.loc));
            }
        })
    })
}
