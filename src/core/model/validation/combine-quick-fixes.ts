import type { Change, TextChange } from '../change-set/change-set.js';
import { ChangeSet } from '../change-set/change-set.js';
import type { AstNodeWithDirectives } from './message.js';
import type { QuickFix } from './quick-fix.js';
import { getSuppressChangeSet, SuppressQuickFix } from './suppress/quick-fix.js';

export interface CombinedQuickFixes {
    /**
     * The changes of all quick fixes in appliedQuickFixes
     */
    readonly changeSet: ChangeSet;

    /**
     * The quick fixes whose changes are included in changeSet
     */
    readonly appliedQuickFixes: ReadonlyArray<QuickFix>;

    /**
     * The quick fixes that were left out because their changes overlap with the changes of a quick
     * fix that comes earlier in the list
     *
     * Validating the project again after applying changeSet will report their messages again (if
     * they still apply), so they can be fixed in another pass.
     */
    readonly skippedQuickFixes: ReadonlyArray<QuickFix>;
}

/**
 * Combines the changes of multiple quick fixes into one change set that can be applied at once
 *
 * The quick fixes need to belong to messages of the same validation result. Quick fixes that would
 * change the same text as a quick fix that comes earlier in the list are skipped. Quick fixes that
 * add @suppress directives to the same node are merged into one change.
 *
 * This can be used to implement a "fix all" action.
 */
export function combineQuickFixes(quickFixes: Iterable<QuickFix>): CombinedQuickFixes {
    const uniqueQuickFixes = [...new Set(quickFixes)];

    // suppress fixes for the same node edit the same @suppress directive, so their changes would
    // overlap. Combine them into one change instead.
    const suppressFixesByNode = new Map<AstNodeWithDirectives, SuppressQuickFix[]>();
    for (const quickFix of uniqueQuickFixes) {
        if (quickFix instanceof SuppressQuickFix) {
            const fixes = suppressFixesByNode.get(quickFix.astNode) ?? [];
            fixes.push(quickFix);
            suppressFixesByNode.set(quickFix.astNode, fixes);
        }
    }

    const changes: Change[] = [];
    const textChanges: TextChange[] = [];
    const appliedQuickFixes: QuickFix[] = [];
    const skippedQuickFixes: QuickFix[] = [];
    const processedQuickFixes = new Set<QuickFix>();
    for (const quickFix of uniqueQuickFixes) {
        if (processedQuickFixes.has(quickFix)) {
            continue;
        }

        let group: ReadonlyArray<QuickFix>;
        let changeSet: ChangeSet;
        if (quickFix instanceof SuppressQuickFix) {
            const suppressFixes = suppressFixesByNode.get(quickFix.astNode)!;
            group = suppressFixes;
            changeSet = getSuppressChangeSet(quickFix.astNode, suppressFixes);
        } else {
            group = [quickFix];
            changeSet = quickFix.getChangeSet();
        }
        for (const fix of group) {
            processedQuickFixes.add(fix);
        }

        // two messages can offer the exact same change (e.g. to remove the same directive)
        const newTextChanges = changeSet.textChanges.filter(
            (change) => !textChanges.some((existing) => isSameTextChange(existing, change)),
        );
        if (
            newTextChanges.some((change) =>
                textChanges.some((existing) => textChangesOverlap(existing, change)),
            )
        ) {
            skippedQuickFixes.push(...group);
            continue;
        }

        textChanges.push(...newTextChanges);
        changes.push(
            ...newTextChanges,
            ...changeSet.appendChanges,
            ...changeSet.yamlAddInMapChanges,
        );
        appliedQuickFixes.push(...group);
    }

    return {
        changeSet: new ChangeSet(changes),
        appliedQuickFixes,
        skippedQuickFixes,
    };
}

function isSameTextChange(a: TextChange, b: TextChange) {
    return (
        a.source.name === b.source.name &&
        a.location.start.offset === b.location.start.offset &&
        a.location.end.offset === b.location.end.offset &&
        a.newText === b.newText
    );
}

/**
 * Determines whether two text changes cannot be applied together
 *
 * Insertions at the same position or at the boundary of a replaced range can be applied together.
 */
function textChangesOverlap(a: TextChange, b: TextChange) {
    if (a.source.name !== b.source.name) {
        return false;
    }
    const aStart = a.location.start.offset;
    const aEnd = a.location.end.offset;
    const bStart = b.location.start.offset;
    const bEnd = b.location.end.offset;
    if (aStart === aEnd && bStart === bEnd) {
        return false;
    }
    return aStart < bEnd && bStart < aEnd;
}
