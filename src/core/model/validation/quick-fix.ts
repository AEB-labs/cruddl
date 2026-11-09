import { ChangeSet } from '../change-set/change-set.js';
import type { QuickFixKind } from './quick-fix-kinds.js';

export interface QuickFixParams {
    /**
     * Short text to show in the UI of what this fix will do
     */
    readonly description: string;

    /**
     * What this fix does, independent of the concrete names and values it changes
     */
    readonly kind: QuickFixKind;

    /**
     * Whether this fix can be applied without reviewing it, e.g. as part of a "fix all" action
     *
     * See QuickFix.isPreferred
     */
    readonly isPreferred: boolean;

    /**
     * The changes to do, or a callback that will calculate the changes when they are requested
     */
    readonly changeSet: ChangeSet | (() => ChangeSet);
}

/**
 * An suggested source change that can help fixing a validation message
 */
export class QuickFix {
    private readonly changeSetOrFn: ChangeSet | (() => ChangeSet);
    private changeSet: ChangeSet | undefined;

    /**
     * Short text to show in the UI of what this fix will do
     */
    readonly description: string;

    /**
     * What this fix does, independent of the concrete names and values it changes
     *
     * Can be used by UIs to group quick fixes, or to offer applying all quick fixes of one kind at
     * once. See QUICK_FIX_KINDS for the possible values.
     */
    readonly kind: QuickFixKind;

    /**
     * Whether this fix can be applied without reviewing it, e.g. as part of a "fix all" action
     *
     * A fix is preferred if it is very likely to be what the user wants in every case. For
     * example, a fix that adds a missing field is preferred. A fix that is only a guess (like
     * replacing an unknown name with a similar one) or that makes a decision the user should make
     * consciously (like adding a @suppress directive or removing a type) is not preferred, even if
     * it is the only fix offered for a message.
     *
     * At most one quick fix of a message is preferred.
     *
     * This is similar to the isPreferred property on a code action of the language server protocol:
     * https://microsoft.github.io/language-server-protocol/specifications/lsp/3.17/specification/#textDocument_codeAction
     */
    readonly isPreferred: boolean;

    constructor(params: QuickFixParams) {
        this.description = params.description;
        this.kind = params.kind;
        this.isPreferred = params.isPreferred;
        this.changeSetOrFn = params.changeSet;
    }

    /**
     * Calculates or gets the changes suggested by this fix
     */
    getChangeSet(): ChangeSet {
        if (!this.changeSet) {
            this.changeSet =
                this.changeSetOrFn instanceof ChangeSet ? this.changeSetOrFn : this.changeSetOrFn();
        }
        return this.changeSet;
    }
}
