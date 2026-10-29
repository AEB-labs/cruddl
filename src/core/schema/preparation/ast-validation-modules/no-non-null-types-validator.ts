import type { DocumentNode, TypeNode } from 'graphql';
import { Kind } from 'graphql';
import { ChangeSet, TextChange } from '../../../model/change-set/change-set.js';
import { ValidationMessage } from '../../../model/validation/message.js';
import { QuickFix } from '../../../model/validation/quick-fix.js';
import { getObjectTypes } from '../../schema-utils.js';
import type { ASTValidator } from '../ast-validator.js';

function findOutermostNonNullNode(
    type: TypeNode,
): Extract<TypeNode, { kind: 'NonNullType' }> | undefined {
    if (type.kind === Kind.NON_NULL_TYPE) {
        return type;
    }
    if (type.kind === Kind.LIST_TYPE) {
        return findOutermostNonNullNode(type.type);
    }
    return undefined;
}

export class NoNonNullTypesValidator implements ASTValidator {
    validate(ast: DocumentNode): ReadonlyArray<ValidationMessage> {
        const validationMessages: ValidationMessage[] = [];
        getObjectTypes(ast).forEach((ot) => {
            (ot.fields ?? []).forEach((field) => {
                const nonNullNode = findOutermostNonNullNode(field.type);
                if (nonNullNode) {
                    validationMessages.push(
                        ValidationMessage.nonSuppressableWarning(
                            'Non-null types (!) have no effect and should be removed.',
                            nonNullNode,
                            { quickFixes: getRemoveNonNullQuickFixes(field.type) },
                        ),
                    );
                }
            });
        });
        return validationMessages;
    }
}

function getRemoveNonNullQuickFixes(type: TypeNode): ReadonlyArray<QuickFix> {
    if (!type.loc) {
        return [];
    }
    const typeText = type.loc.source.body.slice(type.loc.start, type.loc.end);
    return [
        new QuickFix({
            description: 'Remove "!"',
            isPreferred: true,
            changeSet: new ChangeSet([new TextChange(type.loc, typeText.replaceAll('!', ''))]),
        }),
    ];
}
