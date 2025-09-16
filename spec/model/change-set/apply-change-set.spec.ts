import { expect } from 'chai';
import { Pair, parseDocument } from 'yaml';
import { MessageLocation } from '../../../src/model';
import {
    applyChangeSet,
    InvalidChangeSetError,
} from '../../../src/model/change-set/apply-change-set';
import {
    ChangeSet,
    TextChange,
    YamlAddInMapChange,
} from '../../../src/model/change-set/change-set';
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

    it('applies a change set with two inserts at the same position', () => {
        const source = new ProjectSource('file1.txt', `This is a test.`);
        const project = new Project([source]);
        const changeSet = new ChangeSet([
            new TextChange(
                new MessageLocation(source, 'This is a '.length, 'This is a '.length),
                'very good ',
            ),
            new TextChange(
                new MessageLocation(source, 'This is a '.length, 'This is a '.length),
                'more complicated ',
            ),
        ]);
        const newProject = applyChangeSet(project, changeSet);
        expect(newProject.sources.map((s) => s.name)).to.deep.equal(['file1.txt']);
        expect(newProject.sources.map((s) => s.body)).to.deep.equal([
            'This is a very good more complicated test.',
        ]);
    });

    it('applies a change set with two inserts at the same position, with inversed order', () => {
        const source = new ProjectSource('file1.txt', `This is a test.`);
        const project = new Project([source]);
        const changeSet = new ChangeSet([
            new TextChange(
                new MessageLocation(source, 'This is a '.length, 'This is a '.length),
                'more complicated ',
            ),
            new TextChange(
                new MessageLocation(source, 'This is a '.length, 'This is a '.length),
                'very good ',
            ),
        ]);
        const newProject = applyChangeSet(project, changeSet);
        expect(newProject.sources.map((s) => s.name)).to.deep.equal(['file1.txt']);
        expect(newProject.sources.map((s) => s.body)).to.deep.equal([
            'This is a more complicated very good test.',
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

    it('applies a YamlAddInMap change when possible', () => {
        const source = new ProjectSource(
            'file1.yaml',
            `root:
    level1:
        Field A:
        Field B:
    level2:
        Field C`,
        );
        const project = new Project([source]);
        const changeSet = new ChangeSet([
            new YamlAddInMapChange({
                sourceName: 'file1.yaml',
                path: ['root', 'level1'],
                value: new Pair('Field D', 'Test'),
            }),
        ]);
        const newProject = applyChangeSet(project, changeSet);
        expect(newProject.sources.length).to.equal(1);
        expect(newProject.sources[0].name).to.equal('file1.yaml');
        const expectedDoc = parseDocument(
            `root:
    level1:
        Field A:
        Field B:
        Field D: Test
    level2:
        Field C`,
            {},
        );
        expect(newProject.sources[0].body).to.equal(expectedDoc.toString());
    });

    it('does not apply a YamlAddInMap change when the key already exist in the map', () => {
        const source = new ProjectSource(
            'file1.yaml',
            `root:
    level1:
        Field A:
        Field B:
        Field D: Original value
    level2:
        Field C`,
        );
        const project = new Project([source]);
        const changeSet = new ChangeSet([
            new YamlAddInMapChange({
                sourceName: 'file1.yaml',
                path: ['root', 'level1'],
                value: new Pair('Field D', 'Test'),
            }),
        ]);
        const newProject = applyChangeSet(project, changeSet);
        expect(newProject.sources.length).to.equal(1);
        expect(newProject.sources[0].name).to.equal('file1.yaml');
        const expectedDoc = parseDocument(
            `root:
    level1:
        Field A:
        Field B:
        Field D: Original value
    level2:
        Field C`,
            {},
        );
        expect(newProject.sources[0].body).to.equal(expectedDoc.toString());
    });

    it('does nothing and especially does not throw when operating on invalid YAML', () => {
        const source = new ProjectSource(
            'file1.yaml',
            `root:
    level1:
        Field A: This does not work
            FieldB:`,
        );
        const project = new Project([source]);
        const changeSet = new ChangeSet([
            new YamlAddInMapChange({
                sourceName: 'file1.yaml',
                path: ['root', 'level1'],
                value: new Pair('Field D', 'Test'),
            }),
        ]);
        const newProject = applyChangeSet(project, changeSet);
        expect(newProject.sources.length).to.equal(1);
        expect(newProject.sources[0].name).to.equal('file1.yaml');
        expect(newProject.sources[0].body).to.equal(project.sources[0].body);
    });
});
