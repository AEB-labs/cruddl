import {
    ListQueryNode, ObjectQueryNode, PropertySpecification, RuntimeErrorQueryNode, TransformListQueryNode
} from '../../src/query-tree';
import { moveErrorsToOutputNodes } from '../../src/authorization/move-errors-to-output-nodes';
import { expect } from 'chai';

describe('move-errors-to-output-nodes', () => {
    it('moves errors in filter up', () => {
        const tree = new ObjectQueryNode([
            new PropertySpecification('prop1', new TransformListQueryNode({
                listNode: new ListQueryNode([]),
                filterNode: new RuntimeErrorQueryNode('filter error')
            }))
        ]);
        const newTree = moveErrorsToOutputNodes(tree);
        expect((newTree as ObjectQueryNode).properties[0].valueNode.constructor.name).to.equal(RuntimeErrorQueryNode.name);
    });

    it('keeps errors in innerNode', () => {
        const tree = new ObjectQueryNode([
            new PropertySpecification('prop1', new TransformListQueryNode({
                listNode: new ListQueryNode([]),
                innerNode: new RuntimeErrorQueryNode('filter error')
            }))
        ]);
        const newTree = moveErrorsToOutputNodes(tree);
        const transformList = (newTree as ObjectQueryNode).properties[0].valueNode as TransformListQueryNode;
        expect(transformList.constructor.name).to.equal(TransformListQueryNode.name);
        expect(transformList.innerNode.constructor.name).to.equal(RuntimeErrorQueryNode.name);
    });
});
