import type { ASTNode, Location } from 'graphql';
import { Kind } from 'graphql';
import { getSimilarNames } from '../../utils/similar-names.js';
import { MessageLocation } from '../validation/location.js';
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
    return getReplaceWithSimilarNameQuickFixes(node?.loc, name, existingNames, (suggestion) =>
        node?.kind === Kind.STRING ? JSON.stringify(suggestion) : suggestion,
    );
}

/**
 * Offers to replace the text at the given location with the existing names that are similar to the
 * given name
 *
 * @param format converts a suggested name into the replacement text (e.g. to quote it)
 */
export function getReplaceWithSimilarNameQuickFixes(
    location: MessageLocation | Location | undefined,
    name: string,
    existingNames: Iterable<string>,
    format: (suggestion: string) => string = (suggestion) => suggestion,
): ReadonlyArray<QuickFix> {
    if (!location) {
        return [];
    }
    // the location might not exactly match the name (e.g. if it is in a string with escape
    // sequences), and we must not replace anything else
    const messageLocation = MessageLocation.from(location)!;
    const text = messageLocation.source.body.slice(
        messageLocation.start.offset,
        messageLocation.end.offset,
    );
    if (text !== format(name)) {
        return [];
    }
    const suggestions = getSimilarNames(name, existingNames);
    return suggestions.map(
        (suggestion) =>
            new QuickFix({
                description: `Change to "${suggestion}"`,
                isPreferred: suggestions.length === 1,
                changeSet: new ChangeSet([new TextChange(location, format(suggestion))]),
            }),
    );
}
