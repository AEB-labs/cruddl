import type { FieldDefinitionNode, ObjectTypeDefinitionNode } from 'graphql';
import { parse, Source } from 'graphql';
import { describe, expect, it } from 'vitest';
import { Pair } from 'yaml';
import { Project } from '../../project/project.js';
import { ProjectSource } from '../../project/source.js';
import { applyChangeSet } from '../change-set/apply-change-set.js';
import {
    AppendChange,
    ChangeSet,
    TextChange,
    YamlAddInMapChange,
} from '../change-set/change-set.js';
import { combineQuickFixes } from './combine-quick-fixes.js';
import { MessageLocation } from './location.js';
import { Severity } from './message.js';
import { QuickFix } from './quick-fix.js';
import { SuppressQuickFix } from './suppress/quick-fix.js';

function replace(source: ProjectSource, text: string, newText: string) {
    const offset = source.body.indexOf(text);
    return new QuickFix({
        description: `Replace "${text}" with "${newText}"`,
        kind: 'USE_SIMILAR_NAME',
        isPreferred: true,
        changeSet: new ChangeSet([
            new TextChange(new MessageLocation(source, offset, offset + text.length), newText),
        ]),
    });
}

function insertBefore(source: ProjectSource, text: string, newText: string) {
    const offset = source.body.indexOf(text);
    return new QuickFix({
        description: `Insert "${newText}"`,
        kind: 'ADD_MISSING_FIELD',
        isPreferred: true,
        changeSet: new ChangeSet([
            new TextChange(new MessageLocation(source, offset, offset), newText),
        ]),
    });
}

function apply(source: ProjectSource, changeSet: ChangeSet) {
    return applyChangeSet(new Project([source]), changeSet).sources[0].body;
}

describe('combineQuickFixes', () => {
    it('combines quick fixes with independent changes', () => {
        const source = new ProjectSource('file.txt', 'This is a tset with a tpyo.');
        const fix1 = replace(source, 'tset', 'test');
        const fix2 = replace(source, 'tpyo', 'typo');
        const result = combineQuickFixes([fix1, fix2]);
        expect(result.appliedQuickFixes).to.deep.equal([fix1, fix2]);
        expect(result.skippedQuickFixes).to.deep.equal([]);
        expect(apply(source, result.changeSet)).to.equal('This is a test with a typo.');
    });

    it('skips a quick fix that overlaps with an earlier one', () => {
        const source = new ProjectSource('file.txt', 'This is a tset.');
        const fix1 = replace(source, 'tset', 'test');
        const fix2 = replace(source, 'a tset', 'the set');
        const result = combineQuickFixes([fix1, fix2]);
        expect(result.appliedQuickFixes).to.deep.equal([fix1]);
        expect(result.skippedQuickFixes).to.deep.equal([fix2]);
        expect(apply(source, result.changeSet)).to.equal('This is a test.');
    });

    it('skips an insertion within a replaced range', () => {
        const source = new ProjectSource('file.txt', 'This is a tset.');
        const fix1 = replace(source, 'a tset', 'the test');
        const fix2 = insertBefore(source, 'tset', 'good ');
        const result = combineQuickFixes([fix1, fix2]);
        expect(result.skippedQuickFixes).to.deep.equal([fix2]);
        expect(apply(source, result.changeSet)).to.equal('This is the test.');
    });

    it('combines insertions at the same position and at the boundary of a replaced range', () => {
        const source = new ProjectSource('file.txt', 'This is a tset.');
        const fix1 = insertBefore(source, 'tset', 'very ');
        const fix2 = replace(source, 'tset', 'test');
        const fix3 = insertBefore(source, 'tset', 'good ');
        const fix4 = insertBefore(source, '.', '!');
        const result = combineQuickFixes([fix1, fix2, fix3, fix4]);
        expect(result.skippedQuickFixes).to.deep.equal([]);
        expect(apply(source, result.changeSet)).to.equal('This is a very good test!.');
    });

    it('includes an identical change only once', () => {
        const source = new ProjectSource('file.txt', 'This is a tset.');
        const fix1 = replace(source, 'tset', 'test');
        const fix2 = replace(source, 'tset', 'test');
        const result = combineQuickFixes([fix1, fix2]);
        expect(result.appliedQuickFixes).to.deep.equal([fix1, fix2]);
        expect(result.changeSet.changes).to.have.lengthOf(1);
        expect(apply(source, result.changeSet)).to.equal('This is a test.');
    });

    it('includes a quick fix only once if it is passed multiple times', () => {
        const source = new ProjectSource('file.txt', 'This is a tset.');
        const fix = insertBefore(source, 'tset', 'good ');
        const result = combineQuickFixes([fix, fix]);
        expect(result.appliedQuickFixes).to.deep.equal([fix]);
        expect(apply(source, result.changeSet)).to.equal('This is a good tset.');
    });

    it('combines replacements of adjacent ranges', () => {
        const source = new ProjectSource('file.txt', 'This is a tset.');
        const fix1 = replace(source, 'a ', 'the ');
        const fix2 = replace(source, 'tset', 'test');
        const result = combineQuickFixes([fix1, fix2]);
        expect(result.skippedQuickFixes).to.deep.equal([]);
        expect(apply(source, result.changeSet)).to.equal('This is the test.');
    });

    it('skips all changes of a quick fix if one of them overlaps', () => {
        const source = new ProjectSource('file.txt', 'This is a tset with a tpyo.');
        const fix1 = replace(source, 'tset', 'test');
        const tpyoOffset = source.body.indexOf('tpyo');
        const fix2 = new QuickFix({
            description: 'Fix both',
            kind: 'USE_SIMILAR_NAME',
            isPreferred: true,
            changeSet: new ChangeSet([
                new TextChange(new MessageLocation(source, tpyoOffset, tpyoOffset + 4), 'typo'),
                new TextChange(new MessageLocation(source, 10, 12), 'te'),
            ]),
        });
        const result = combineQuickFixes([fix1, fix2]);
        expect(result.skippedQuickFixes).to.deep.equal([fix2]);
        expect(apply(source, result.changeSet)).to.equal('This is a test with a tpyo.');
    });

    it('does not consider changes in different sources as overlapping', () => {
        const source1 = new ProjectSource('file1.txt', 'This is a tset.');
        const source2 = new ProjectSource('file2.txt', 'This is a tset.');
        const fix1 = replace(source1, 'tset', 'test');
        const fix2 = replace(source2, 'a tset', 'the test');
        const result = combineQuickFixes([fix1, fix2]);
        expect(result.skippedQuickFixes).to.deep.equal([]);
        const newProject = applyChangeSet(new Project([source1, source2]), result.changeSet);
        expect(newProject.sources.map((s) => s.body)).to.deep.equal([
            'This is a test.',
            'This is the test.',
        ]);
    });

    it('includes the append and YAML changes of the applied quick fixes', () => {
        const source = new ProjectSource('file.txt', 'This is a tset.');
        const append = new AppendChange('new.txt', 'appended');
        const yamlAdd = new YamlAddInMapChange({
            sourceName: 'new.yml',
            path: ['a'],
            value: new Pair('b', 'c'),
        });
        const fix1 = replace(source, 'tset', 'test');
        const fix2 = new QuickFix({
            description: 'Add files',
            kind: 'ADD_MISSING_TYPE',
            isPreferred: true,
            changeSet: new ChangeSet([append, yamlAdd]),
        });
        const fix3 = new QuickFix({
            description: 'Conflicting fix with an append change',
            kind: 'ADD_MISSING_TYPE',
            isPreferred: true,
            changeSet: new ChangeSet([
                new TextChange(new MessageLocation(source, 10, 14), 'other'),
                new AppendChange('skipped.txt', 'skipped'),
            ]),
        });
        const result = combineQuickFixes([fix1, fix2, fix3]);
        expect(result.skippedQuickFixes).to.deep.equal([fix3]);
        expect(result.changeSet.appendChanges).to.deep.equal([append]);
        expect(result.changeSet.yamlAddInMapChanges).to.deep.equal([yamlAdd]);
    });

    describe('with @suppress quick fixes', () => {
        function getFieldNode(source: ProjectSource) {
            const document = parse(new Source(source.body, source.name));
            const type = document.definitions[0] as ObjectTypeDefinitionNode;
            return type.fields![0] as FieldDefinitionNode;
        }

        it('merges fixes for the same node into one directive', () => {
            const source = new ProjectSource(
                'schema.graphqls',
                'type Stuff @rootEntity {\n    foo: String\n}',
            );
            const node = getFieldNode(source);
            const fixes = [
                new SuppressQuickFix(Severity.WARNING, 'DEPRECATED', node),
                new SuppressQuickFix(Severity.WARNING, 'NAMING', node),
                new SuppressQuickFix(Severity.INFO, 'INEFFECTIVE_ACCESS_FIELD', node),
            ];
            const result = combineQuickFixes(fixes);
            expect(result.appliedQuickFixes).to.deep.equal(fixes);
            expect(apply(source, result.changeSet)).to.equal(
                'type Stuff @rootEntity {\n    foo: String @suppress(warnings: [DEPRECATED, NAMING], infos: INEFFECTIVE_ACCESS_FIELD)\n}',
            );
        });

        it('merges fixes for the same node into an existing directive', () => {
            const source = new ProjectSource(
                'schema.graphqls',
                'type Stuff @rootEntity {\n    foo: String @suppress(warnings: UNUSED, infos: [])\n}',
            );
            const node = getFieldNode(source);
            const result = combineQuickFixes([
                new SuppressQuickFix(Severity.WARNING, 'DEPRECATED', node),
                new SuppressQuickFix(Severity.INFO, 'INEFFECTIVE_ACCESS_FIELD', node),
                new SuppressQuickFix(Severity.COMPATIBILITY_ISSUE, 'COLLECT', node),
                new SuppressQuickFix(Severity.WARNING, 'NAMING', node),
            ]);
            expect(apply(source, result.changeSet)).to.equal(
                'type Stuff @rootEntity {\n    foo: String @suppress(warnings: [UNUSED, DEPRECATED, NAMING], infos: [INEFFECTIVE_ACCESS_FIELD], compatibilityIssues: COLLECT)\n}',
            );
        });

        it('skips all fixes for a node if the merged change overlaps with an earlier fix', () => {
            const source = new ProjectSource(
                'schema.graphqls',
                'type Stuff @rootEntity {\n    foo: String\n}',
            );
            const node = getFieldNode(source);
            // the directive would be inserted after "String", which is within this range
            const replaceField = replace(source, 'String\n', 'Int\n');
            const suppressFixes = [
                new SuppressQuickFix(Severity.WARNING, 'DEPRECATED', node),
                new SuppressQuickFix(Severity.WARNING, 'NAMING', node),
            ];
            const result = combineQuickFixes([replaceField, ...suppressFixes]);
            expect(result.appliedQuickFixes).to.deep.equal([replaceField]);
            expect(result.skippedQuickFixes).to.deep.equal(suppressFixes);
        });
    });
});
