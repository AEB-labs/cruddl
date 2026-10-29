import type { DirectiveNode, ObjectTypeDefinitionNode } from 'graphql';
import { parse } from 'graphql';
import { describe, expect, it } from 'vitest';
import { Project } from '../../project/project.js';
import { ProjectSource } from '../../project/source.js';
import { applyChangeSet } from './apply-change-set.js';
import { ChangeSet, type TextChange } from './change-set.js';
import { createRemoveInlineNodeChange } from './graphql-changes.js';

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
});
