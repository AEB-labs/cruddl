import { ProjectSource } from '../../../src/project/source';
import { SidecarSchemaValidator } from '../../../src/schema/preparation/source-validation-modules/sidecar-schema';
import { expect } from 'chai';
import { Kind, load, YAMLAnchorReference, YamlMap, YAMLMapping, YAMLNode, YAMLScalar, YAMLSequence } from 'yaml-ast-parser';

const validValue = `
a: {b: {c: apfel}}
`;

describe('sidecar-schema validator', () => {
    const validator = new SidecarSchemaValidator();

    function extractAllPaths(node: YAMLNode, curPath: (string | number)[]): ((string | number)[])[] {
        switch (node.kind) {
            case Kind.MAP:
                const mapNode = node as YamlMap;
                const temp = ([] as ((string | number)[])[]).concat(...(mapNode.mappings.map(
                    (childNode, index) => extractAllPaths(childNode, [...curPath]))));
                return [...temp];
                break;
            case Kind.MAPPING:
                const mappingNode = node as YAMLMapping;
                console.log(mappingNode.key.value);
                if (mappingNode.value) {
                    return [curPath, ...extractAllPaths(mappingNode.value, [...curPath, mappingNode.key.value])];
                }
                break;
            case Kind.SCALAR:
                const scalarNode = node as YAMLScalar;
                console.log(curPath);
                return [curPath];
                break;
            case Kind.SEQ:
                const seqNode = node as YAMLSequence;
                seqNode.items.forEach((childNode, index) => extractAllPaths(childNode, [...curPath, index]));
                break;
            case Kind.INCLUDE_REF:
            case Kind.ANCHOR_REF:
                const refNode = node as YAMLAnchorReference;
                return extractAllPaths(refNode.value, [...curPath]);
                break;
        }
        return [curPath];
    }

    it('reports errors', () => {
        const root: YAMLNode = load(validValue);
        console.log(root);
        const paths = extractAllPaths(root, []);
        console.log(paths);
    });

});
