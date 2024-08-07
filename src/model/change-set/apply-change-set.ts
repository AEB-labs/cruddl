import { Project } from '../../project/project';
import { ProjectSource } from '../../project/source';
import { ChangeSet, TextChange } from './change-set';

export class InvalidChangeSetError extends Error {
    constructor(message: string) {
        super(message);
        this.name = this.constructor.name;
    }
}

export function applyChangeSet(project: Project, changeSet: ChangeSet): Project {
    const changedSources = project.sources.map((source) => {
        const textChanges = changeSet.textChanges.filter((c) => c.source.name === source.name);
        const appendChanges = changeSet.appendChanges.filter((c) => c.sourceName === source.name);
        let newText = applyChanges(source, textChanges);
        for (const change of appendChanges) {
            newText += (newText.length ? '\n\n' : '') + change.text;
        }
        if (newText === source.body) {
            return source;
        } else {
            return new ProjectSource(source.name, newText, source.filePath);
        }
    });
    const existingSourceNames = new Set(project.sources.map((s) => s.name));
    const appendSourceNames = new Set(changeSet.appendChanges.map((c) => c.sourceName));
    const newSourceNames = [...appendSourceNames].filter((name) => !existingSourceNames.has(name));
    const newSources = [...newSourceNames].map((sourceName) => {
        const appendChanges = changeSet.appendChanges.filter((c) => c.sourceName === sourceName);
        let newText = '';
        for (const change of appendChanges) {
            newText += (newText.length ? '\n\n' : '') + change.text;
        }
        return new ProjectSource(sourceName, newText);
    });

    return new Project({
        ...project,
        sources: [...changedSources, ...newSources],
    });
}

function applyChanges(source: ProjectSource, changes: ReadonlyArray<TextChange>): string {
    if (!changes.length) {
        return source.body;
    }

    const sortedChanges = [...changes].sort(
        (a, b) => a.location.start.offset - b.location.start.offset,
    );

    let currentPosition = 0;
    let output = '';
    // i == 0: content before the first change. i === sortedChanges.length: content after the last change
    let lastChange = undefined;
    for (let i = 0; i <= sortedChanges.length; i++) {
        const change = sortedChanges[i] as TextChange | undefined;
        const includeUntilIndex = change ? change.location.start.offset : source.body.length;
        if (includeUntilIndex < currentPosition) {
            // two conflicting changes cannot be applied in general without causing a mess
            throw new InvalidChangeSetError(
                `Change in "${source.name}" at ${formatChangeLocation(
                    lastChange,
                )} overlaps with change at ${formatChangeLocation(change)}`,
            );
        }
        output += source.body.substring(currentPosition, includeUntilIndex);
        if (change) {
            output += change.newText;
            currentPosition = sortedChanges[i].location.end.offset;
        }
        lastChange = change;
    }
    return output;
}

function formatChangeLocation(change: TextChange | undefined): string {
    if (!change) {
        return '<source bounds>';
    }
    return `${change.location.start.line}:${change.location.start.column} - ${change.location.end.line}:${change.location.end.column}`;
}
