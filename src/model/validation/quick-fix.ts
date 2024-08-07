import { ChangeSet } from '../change-set/change-set';

export interface QuickFixParams {
    /**
     * Short text to show in the UI of what this fix will do
     */
    readonly description: string;

    /**
     * Whether this is likely a fix of the underlying problem
     *
     * For example, a code fix to add a missing field would be preferred, while a code fix to add a @supress directive would not be preferred.
     *
     * Can be used by UIs to apply a quick fix via a hotkey, or to offer a "fix all issues" feature.
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
     * Whether this is likely a fix of the underlying problem
     *
     * For example, a code fix to add a missing field would be preferred, while a code fix to add a @supress directive would not be preferred.
     *
     * Can be used by UIs to apply a quick fix via a hotkey, or to offer a "fix all issues" feature.
     *
     * This is similar to the isPreferred property on a code action of the language server protocol:
     * https://microsoft.github.io/language-server-protocol/specifications/lsp/3.17/specification/#textDocument_codeAction
     */
    readonly isPreferred: boolean;

    constructor(params: QuickFixParams) {
        this.description = params.description;
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
