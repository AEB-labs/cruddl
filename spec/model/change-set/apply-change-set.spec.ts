import { expect } from 'chai';
import { MessageLocation } from '../../../src/model';
import {
    applyChangeSet,
    InvalidChangeSetError,
} from '../../../src/model/change-set/apply-change-set';
import { ChangeSet, TextChange } from '../../../src/model/change-set/change-set';
import { Project } from '../../../src/project/project';
import { ProjectSource } from '../../../src/project/source';

describe('applyChangeSet', () => {
    it('applies a change set with a single change', () => {
        const source = new ProjectSource('file1.txt', `This is a test.`);
        const project = new Project([source]);
        const changeSet = new ChangeSet([
            new TextChange(new MessageLocation(source, 'This '.length, 'This is'.length), 'was'),
        ]);
        const newProject = applyChangeSet(project, changeSet);
        expect(newProject.sources.map((s) => s.name)).to.deep.equal(['file1.txt']);
        expect(newProject.sources.map((s) => s.body)).to.deep.equal(['This was a test.']);
    });

    it('applies a change set with multiple changes', () => {
        const source = new ProjectSource('file1.txt', `This is a test.`);
        const project = new Project([source]);
        const changeSet = new ChangeSet([
            new TextChange(new MessageLocation(source, 'This '.length, 'This is'.length), 'was'),
            new TextChange(
                new MessageLocation(source, 'This is a '.length, 'This is a '.length),
                'more complicated ',
            ),
        ]);
        const newProject = applyChangeSet(project, changeSet);
        expect(newProject.sources.map((s) => s.name)).to.deep.equal(['file1.txt']);
        expect(newProject.sources.map((s) => s.body)).to.deep.equal([
            'This was a more complicated test.',
        ]);
    });

    it('applies a change set with unordered changes', () => {
        const source = new ProjectSource('file1.txt', `This is a test.`);
        const project = new Project([source]);
        const changeSet = new ChangeSet([
            new TextChange(
                new MessageLocation(source, 'This is a '.length, 'This is a '.length),
                'more complicated ',
            ),
            new TextChange(new MessageLocation(source, 'This '.length, 'This is'.length), 'was'),
        ]);
        const newProject = applyChangeSet(project, changeSet);
        expect(newProject.sources.map((s) => s.name)).to.deep.equal(['file1.txt']);
        expect(newProject.sources.map((s) => s.body)).to.deep.equal([
            'This was a more complicated test.',
        ]);
    });

    it('throws on a change set with overlapping changes', () => {
        const source = new ProjectSource('file1.txt', `This is a test.`);
        const project = new Project([source]);
        const changeSet = new ChangeSet([
            new TextChange(
                new MessageLocation(source, 'This '.length, 'This is a'.length),
                'was the',
            ),
            new TextChange(
                new MessageLocation(source, 'This is '.length, 'This is a'.length),
                'my',
            ),
        ]);
        expect(() => applyChangeSet(project, changeSet)).to.throw(
            InvalidChangeSetError,
            'Change in "file1.txt" at 1:6 - 1:10 overlaps with change at 1:9 - 1:10',
        );
    });

    it('applies a change set with changes in two different sources', () => {
        const source1 = new ProjectSource('file1.txt', `This is a test.`);
        const source2 = new ProjectSource('file2.txt', `This is a second file.`);
        const project = new Project([source1, source2]);
        const changeSet = new ChangeSet([
            new TextChange(
                new MessageLocation(source1, 'This is '.length, 'This is a'.length),
                'the first',
            ),
            new TextChange(
                new MessageLocation(source2, 'This is '.length, 'This is a'.length),
                'the modified',
            ),
        ]);
        const newProject = applyChangeSet(project, changeSet);
        expect(newProject.sources.map((s) => s.name)).to.deep.equal(['file1.txt', 'file2.txt']);
        expect(newProject.sources.map((s) => s.body)).to.deep.equal([
            'This is the first test.',
            'This is the modified second file.',
        ]);
    });
});
