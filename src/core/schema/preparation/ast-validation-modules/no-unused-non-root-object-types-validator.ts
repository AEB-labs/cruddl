import type { DocumentNode, ObjectTypeDefinitionNode } from 'graphql';
import { ChangeSet } from '../../../model/change-set/change-set.js';
import { createRemoveLinesChange } from '../../../model/change-set/graphql-changes.js';
import { ValidationMessage } from '../../../model/validation/message.js';
import { QuickFix } from '../../../model/validation/quick-fix.js';
import {
    getNamedTypeDefinitionAST,
    getObjectTypes,
    getRootEntityTypes,
    getTypeNameIgnoringNonNullAndList,
} from '../../schema-utils.js';
import type { ASTValidator } from '../ast-validator.js';

export class NoUnusedNonRootObjectTypesValidator implements ASTValidator {
    validate(ast: DocumentNode): ReadonlyArray<ValidationMessage> {
        // store all object types to a set
        const objectTypeNames = new Set<ObjectTypeDefinitionNode>(
            getObjectTypes(ast).map((objectType) => objectType),
        );
        // remove all root entities
        getRootEntityTypes(ast).forEach((rootType) => {
            objectTypeNames.delete(rootType);
        });
        // remove all object types from the set which are referenced by some fields
        getObjectTypes(ast).forEach((objectType) =>
            (objectType.fields || []).forEach((field) =>
                objectTypeNames.delete(
                    getNamedTypeDefinitionAST(
                        ast,
                        getTypeNameIgnoringNonNullAndList(field.type),
                    ) as ObjectTypeDefinitionNode,
                ),
            ),
        );
        // remaining object types in set are unused, create warnings for them
        return Array.from(objectTypeNames).map((unusedType) =>
            ValidationMessage.suppressableWarning(
                'UNUSED',
                `Type "${unusedType.name.value}" is not used.`,
                unusedType,
                {
                    location: unusedType.name,
                    quickFixes: unusedType.loc
                        ? [
                              new QuickFix({
                                  description: 'Remove type',
                                  // the type might be added for later use
                                  isPreferred: false,
                                  changeSet: new ChangeSet([
                                      createRemoveLinesChange(unusedType.loc),
                                  ]),
                              }),
                          ]
                        : [],
                },
            ),
        );
    }
}
