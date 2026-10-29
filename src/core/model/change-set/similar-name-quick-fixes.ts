import type { ASTNode } from 'graphql';
import { Kind } from 'graphql';
import { getSimilarNames } from '../../utils/similar-names.js';
import { QuickFix } from '../validation/quick-fix.js';
import { ChangeSet, TextChange } from './change-set.js';

/**
 * Offers to replace a name that does not exist with the existing names that are similar to it
 *
 * @param node the name, or a string value containing the name
 */
export function getUseSimilarNameQuickFixes(
    node: ASTNode | undefined,
    name: string,
    existingNames: Iterable<string>,
): ReadonlyArray<QuickFix> {
    if (!node?.loc) {
        return [];
    }
    const loc = node.loc;
    const suggestions = getSimilarNames(name, existingNames);
    return suggestions.map(
        (suggestion) =>
            new QuickFix({
                description: `Change to "${suggestion}"`,
                isPreferred: suggestions.length === 1,
                changeSet: new ChangeSet([
                    new TextChange(
                        loc,
                        node.kind === Kind.STRING ? JSON.stringify(suggestion) : suggestion,
                    ),
                ]),
            }),
    );
}
