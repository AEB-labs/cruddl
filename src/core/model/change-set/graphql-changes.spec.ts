import type { DirectiveNode, ObjectTypeDefinitionNode } from 'graphql';
import { parse } from 'graphql';
import { describe, expect, it } from 'vitest';
import { Project } from '../../project/project.js';
import { ProjectSource } from '../../project/source.js';
import { applyChangeSet } from './apply-change-set.js';
import { ChangeSet, type TextChange } from './change-set.js';
import {
    createInsertionChange,
    createRemoveArgumentChange,
    createRemoveInlineNodeChange,
    createRemoveLinesChange,
} from './graphql-changes.js';

function apply(body: string, getChange: (type: ObjectTypeDefinitionNode) => TextChange) {
    const source = new ProjectSource('schema.graphqls', body);
    const type = parse(source.toGraphQLSource()).definitions[0] as ObjectTypeDefinitionNode;
    const changeSet = new ChangeSet([getChange(type)]);
    return applyChangeSet(new Project([source]), changeSet).sources[0].body;
}

function getFieldDirective(type: ObjectTypeDefinitionNode): DirectiveNode {
    return type.fields![0].directives![0];
}

describe('graphql changes', () => {
    describe('createRemoveArgumentChange', () => {
        function removeArgument(body: string, argumentName: string) {
            return apply(body, (type) => {
                const directive = getFieldDirective(type);
                const argument = directive.arguments!.find((a) => a.name.value === argumentName)!;
                return createRemoveArgumentChange(directive, argument)!;
            });
        }

        it('removes the parentheses if it is the only argument', () => {
            expect(removeArgument('type T { f: String @d(a: 1) }', 'a')).to.equal(
                'type T { f: String @d }',
            );
        });

        it('removes the first argument and the comma after it', () => {
            expect(removeArgument('type T { f: String @d(a: 1, b: 2) }', 'a')).to.equal(
                'type T { f: String @d(b: 2) }',
            );
        });

        it('removes the last argument and the comma before it', () => {
            expect(removeArgument('type T { f: String @d(a: 1, b: 2) }', 'b')).to.equal(
                'type T { f: String @d(a: 1) }',
            );
        });

        it('removes a middle argument', () => {
            expect(removeArgument('type T { f: String @d(a: 1, b: 2, c: 3) }', 'b')).to.equal(
                'type T { f: String @d(a: 1, c: 3) }',
            );
        });

        it('removes an argument without commas', () => {
            expect(removeArgument('type T { f: String @d(a: 1 b: 2) }', 'a')).to.equal(
                'type T { f: String @d(b: 2) }',
            );
        });
    });

    describe('createRemoveInlineNodeChange', () => {
        it('removes a directive and the space before it', () => {
            expect(
                apply('type T { f: String @a @b }', (type) =>
                    createRemoveInlineNodeChange(getFieldDirective(type).loc!),
                ),
            ).to.equal('type T { f: String @b }');
        });

        it('removes the whole line if the directive is on its own line', () => {
            expect(
                apply('type T {\n    f: String\n        @a\n    g: Int\n}\n', (type) =>
                    createRemoveInlineNodeChange(getFieldDirective(type).loc!),
                ),
            ).to.equal('type T {\n    f: String\n    g: Int\n}\n');
        });
    });

    describe('createRemoveLinesChange', () => {
        it('removes a field on its own line', () => {
            expect(
                apply('type T {\n    f: String\n    g: Int\n}\n', (type) =>
                    createRemoveLinesChange(type.fields![0].loc!),
                ),
            ).to.equal('type T {\n    g: Int\n}\n');
        });

        it('removes one of the blank lines around the node', () => {
            const body =
                'type A {\n    a: String\n}\n\ntype B {\n    b: String\n}\n\ntype C {\n    c: String\n}\n';
            const source = new ProjectSource('schema.graphqls', body);
            const typeB = parse(source.toGraphQLSource()).definitions[1];
            const newBody = applyChangeSet(
                new Project([source]),
                new ChangeSet([createRemoveLinesChange(typeB.loc!)]),
            ).sources[0].body;
            expect(newBody).to.equal('type A {\n    a: String\n}\n\ntype C {\n    c: String\n}\n');
        });

        it('only removes the node if the line contains other content', () => {
            expect(
                apply('type T { f: String g: Int }', (type) =>
                    createRemoveLinesChange(type.fields![0].loc!),
                ),
            ).to.equal('type T { g: Int }');
        });
    });

    describe('createInsertionChange', () => {
        it('inserts text at the offset', () => {
            expect(
                apply('type T { f: String }', (type) =>
                    createInsertionChange(type.fields![0].loc!.end, type.loc!, ' @d'),
                ),
            ).to.equal('type T { f: String @d }');
        });
    });
});
