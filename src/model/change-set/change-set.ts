import { Location } from 'graphql';
import { Project } from '../../project/project';
import { ProjectSource } from '../../project/source';
import { LocationLike, MessageLocation } from '../validation/location';

/**
 * A set of changes to one or multiple project sources
 */
export class ChangeSet {
    constructor(readonly changes: ReadonlyArray<TextChange>) {}
}

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
