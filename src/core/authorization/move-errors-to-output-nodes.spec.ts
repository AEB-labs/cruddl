import { describe, expect, it } from 'vitest';
import { FLEX_SEARCH_TOO_MANY_OBJECTS, RuntimeErrorQueryNode } from '../query-tree/errors.js';
import { ListQueryNode, TransformListQueryNode } from '../query-tree/lists.js';
import { ConstBoolQueryNode } from '../query-tree/literals.js';
import { ObjectQueryNode, PropertySpecification } from '../query-tree/objects.js';
import { ConditionalQueryNode } from '../query-tree/operators.js';
import { PreExecQueryParms, WithPreExecutionQueryNode } from '../query-tree/pre-exec.js';
import { moveErrorsToOutputNodes } from './move-errors-to-output-nodes.js';

describe('move-errors-to-output-nodes', () => {
    it('moves errors in filter up', () => {
        const tree = new ObjectQueryNode([
            new PropertySpecification(
                'prop1',
                new TransformListQueryNode({
                    listNode: new ListQueryNode([]),
                    filterNode: new RuntimeErrorQueryNode('filter error'),
                }),
            ),
        ]);
        const newTree = moveErrorsToOutputNodes(tree);
        expect((newTree as ObjectQueryNode).properties[0].valueNode.constructor.name).to.equal(
            RuntimeErrorQueryNode.name,
        );
    });

    it('keeps errors in innerNode', () => {
        const tree = new ObjectQueryNode([
            new PropertySpecification(
                'prop1',
                new TransformListQueryNode({
                    listNode: new ListQueryNode([]),
                    innerNode: new RuntimeErrorQueryNode('filter error'),
                }),
            ),
        ]);
        const newTree = moveErrorsToOutputNodes(tree);
        const transformList = (newTree as ObjectQueryNode).properties[0]
            .valueNode as TransformListQueryNode;
        expect(transformList.constructor.name).to.equal(TransformListQueryNode.name);
        expect(transformList.innerNode.constructor.name).to.equal(RuntimeErrorQueryNode.name);
    });

    it('ConditionalQueryNode moves errors in condition up', () => {
        const tree = new ObjectQueryNode([
            new PropertySpecification(
                'prop1',
                new ConditionalQueryNode(
                    new RuntimeErrorQueryNode('condition error'),
                    new TransformListQueryNode({ listNode: new ListQueryNode([]) }),
                    new TransformListQueryNode({ listNode: new ListQueryNode([]) }),
                ),
            ),
        ]);
        const newTree = moveErrorsToOutputNodes(tree);
        expect((newTree as ObjectQueryNode).properties[0].valueNode.constructor.name).to.equal(
            RuntimeErrorQueryNode.name,
        );
    });

    it('ConditionalQueryNode keeps errors in expression', () => {
        const tree = new ObjectQueryNode([
            new PropertySpecification(
                'prop1',
                new ConditionalQueryNode(
                    new ConstBoolQueryNode(true),
                    new TransformListQueryNode({ listNode: new ListQueryNode([]) }),
                    new RuntimeErrorQueryNode('expression error'),
                ),
            ),
        ]);
        const newTree = moveErrorsToOutputNodes(tree);
        const conditionalQueryNode = (newTree as ObjectQueryNode).properties[0]
            .valueNode as ConditionalQueryNode;
        expect(conditionalQueryNode.constructor.name).to.equal(ConditionalQueryNode.name);
        expect(conditionalQueryNode.expr2.constructor.name).to.equal(RuntimeErrorQueryNode.name);
    });

    it('WithPreExecutionQueryNode moves errors in condition up', () => {
        const tree = new ObjectQueryNode([
            new PropertySpecification(
                'prop1',
                new WithPreExecutionQueryNode({
                    resultNode: new TransformListQueryNode({ listNode: new ListQueryNode([]) }),
                    preExecQueries: [
                        new PreExecQueryParms({
                            query: new RuntimeErrorQueryNode('condition error'),
                        }),
                    ],
                }),
            ),
        ]);
        const newTree = moveErrorsToOutputNodes(tree);
        expect((newTree as ObjectQueryNode).properties[0].valueNode.constructor.name).to.equal(
            RuntimeErrorQueryNode.name,
        );
    });

    it('moves errors in result node up', () => {
        const tree = new ObjectQueryNode([
            new PropertySpecification(
                'prop1',
                new WithPreExecutionQueryNode({
                    resultNode: new RuntimeErrorQueryNode('resultNode error'),
                    preExecQueries: [
                        new PreExecQueryParms({
                            query: new TransformListQueryNode({ listNode: new ListQueryNode([]) }),
                        }),
                    ],
                }),
            ),
        ]);
        const newTree = moveErrorsToOutputNodes(tree);
        expect((newTree as ObjectQueryNode).properties[0].valueNode.constructor.name).to.equal(
            RuntimeErrorQueryNode.name,
        );
    });

    it('do move up necessary error message', () => {
        const tree = new ObjectQueryNode([
            new PropertySpecification(
                'prop1',
                new WithPreExecutionQueryNode({
                    resultNode: new RuntimeErrorQueryNode('resultNode error'),
                    preExecQueries: [
                        new PreExecQueryParms({
                            query: new RuntimeErrorQueryNode('query error'),
                        }),
                    ],
                }),
            ),
        ]);
        const newTree = moveErrorsToOutputNodes(tree);
        expect((newTree as ObjectQueryNode).properties[0].valueNode.constructor.name).to.equal(
            RuntimeErrorQueryNode.name,
        );
        expect(
            (<RuntimeErrorQueryNode>(newTree as ObjectQueryNode).properties[0].valueNode).message,
        ).to.equal('query error, resultNode error');
    });

    it('does not unnecessarily move up error message', () => {
        const tree = new ObjectQueryNode([
            new PropertySpecification(
                'prop1',
                new WithPreExecutionQueryNode({
                    resultNode: new ConditionalQueryNode(
                        new ConstBoolQueryNode(true),
                        new RuntimeErrorQueryNode('Too many objects.', {
                            code: FLEX_SEARCH_TOO_MANY_OBJECTS,
                        }),
                        new RuntimeErrorQueryNode('Too many objects.', {
                            code: FLEX_SEARCH_TOO_MANY_OBJECTS,
                        }),
                    ),
                    preExecQueries: [
                        new PreExecQueryParms({
                            query: new RuntimeErrorQueryNode('query error'),
                        }),
                    ],
                }),
            ),
        ]);
        const newTree = moveErrorsToOutputNodes(tree);
        expect((newTree as ObjectQueryNode).properties[0].valueNode.constructor.name).to.equal(
            RuntimeErrorQueryNode.name,
        );
        expect(
            (<RuntimeErrorQueryNode>(newTree as ObjectQueryNode).properties[0].valueNode).message,
        ).to.equal('query error');
    });
});
