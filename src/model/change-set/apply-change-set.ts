import { Project } from '../../project/project';
import { ProjectSource } from '../../project/source';
import { getYamlMapAtPath, safeParseDocument } from '../compatibility-check/utils';
import { ChangeSet, TextChange, YamlAddInMapChange } from './change-set';

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
        const yamlAddInMapChanges = changeSet.yamlAddInMapChanges.filter(
            (c) => c.args.sourceName === source.name,
        );
        let newText = applyTextChanges(source, textChanges);
        for (const appendChange of appendChanges) {
            newText += (newText.length ? '\n\n' : '') + appendChange.text;
        }
        for (const yamlAddChange of yamlAddInMapChanges) {
            newText = applyYamlAddInMapChange(newText, yamlAddChange);
        }
        if (newText === source.body) {
            return source;
        } else {
            return new ProjectSource(source.name, newText, source.filePath);
        }
    });
    const existingSourceNames = new Set(project.sources.map((s) => s.name));
    const appendSourceNames = new Set(changeSet.appendChanges.map((c) => c.sourceName));
    const yamlAddSourceNames = new Set(changeSet.yamlAddInMapChanges.map((c) => c.args.sourceName));
    const newSourceNames = [...appendSourceNames, ...yamlAddSourceNames].filter(
        (name) => !existingSourceNames.has(name),
    );
    const newSources = [...newSourceNames].map((sourceName) => {
        const appendChanges = changeSet.appendChanges.filter((c) => c.sourceName === sourceName);
        const yamlAddInMapChanges = changeSet.yamlAddInMapChanges.filter(
            (c) => c.args.sourceName === sourceName,
        );
        let newText = '';
        for (const appendChange of appendChanges) {
            newText += (newText.length ? '\n\n' : '') + appendChange.text;
        }
        for (const yamlAddChange of yamlAddInMapChanges) {
            newText = applyYamlAddInMapChange(newText, yamlAddChange);
        }
        return new ProjectSource(sourceName, newText);
    });

    return new Project({
        ...project.options,
        sources: [...changedSources, ...newSources],
    });
}

function applyTextChanges(source: ProjectSource, changes: ReadonlyArray<TextChange>): string {
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

export function applyYamlAddInMapChange(source: string, change: YamlAddInMapChange): string {
    const doc = safeParseDocument(source);

    if (!doc) {
        return source;
    }

    const { path, value } = change.args;
    // no value exist at this path, set the value
    if (!doc.hasIn(path)) {
        doc.setIn(path, value);
    } else {
        // otherwise check if the map contains the key before adding, the yaml library throws an error
        // when duplicate keys are encountered
        const parentMap = getYamlMapAtPath(doc, path);
        if (!parentMap || !parentMap?.get(value.key)) {
            doc.addIn(path, value);
        }
    }
    return doc.toString();
}
