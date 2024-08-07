import { Location } from 'graphql';
import { ProjectSource } from '../../project/source';
import { MessageLocation } from '../validation/location';

export type Change = TextChange | AppendChange;

/**
 * A set of changes to one or multiple project sources
 */
export class ChangeSet {
    readonly textChanges: ReadonlyArray<TextChange>;
    readonly appendChanges: ReadonlyArray<AppendChange>;

    constructor(readonly changes: ReadonlyArray<Change>) {
        this.textChanges = changes.filter((c) => c instanceof TextChange);
        this.appendChanges = changes.filter((c) => c instanceof AppendChange);
    }
}

/**
 * A change that either deletes a span in an existing source or replaces that span with new text
 */
export class TextChange {
    readonly source: ProjectSource;

    /**
     * The range of text to delete
     */
    readonly location: MessageLocation;

    constructor(
        /**
         * The range of text to delete
         */
        location: MessageLocation | Location,
        /**
         * The new text to insert at the location (empty string if the text should just be deleted)
         */
        readonly newText: string,
    ) {
        // we don't use MessageLocation.from() because that would allow to pass an ASTNode which does not necessarily have a location
        // changes without a location do not work, so we would need to throw at runtime, which is bad
        this.location =
            location instanceof MessageLocation
                ? location
                : MessageLocation.fromGraphQLLocation(location);
        this.source = this.location.source;
    }
}

/**
 * A change that creates a new source with a given name or appends text to an existing source
 *
 * If there are multiple AppendToNewSource instances with the same sourceName in a changeset, the content of all of them will be appended to the source, separated by two newlines.
 */
export class AppendChange {
    constructor(
        /**
         * The name of the new source
         */
        readonly sourceName: string,

        /**
         * The text for the new source
         */
        readonly text: string,
    ) {}
}
