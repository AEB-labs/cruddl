import { ParsedObjectProjectSource, ParsedProjectSource, ParsedProjectSourceBaseKind } from '../../../src/config/parsed-project';
import { ProjectSource } from '../../../src/project/source';
import { SidecarSchemaValidator } from '../../../src/schema/preparation/source-validation-modules/sidecar-schema';
import { expect } from 'chai';
import { Kind, load, YAMLAnchorReference, YamlMap, YAMLMapping, YAMLNode, YAMLScalar, YAMLSequence } from 'yaml-ast-parser';
import { parseProjectSource } from '../../../src/schema/schema-builder';

const yamlContent = `
a: 
  b: 
    c: apfel
d: 
  - test1
  - test2
  - test3
e:
  - 0
  - 1
  - 2

`;

const correspondingObject = {"a":{"b":{"c":"apfel"}},"d":["test1","test2","test3"],"e":[0,1,2]};

describe('YAML parser and validator', () => {

    it('returns the right message locations', () => {
        const source = new ProjectSource('test.yaml', yamlContent);
        const result = parseProjectSource(source);
        if (!result) {
            expect(result).not.to.be.undefined;
            return;
        }

        if (result.kind == ParsedProjectSourceBaseKind.OBJECT) {
            expect(result.pathLocationMap['a']._start).to.be.eq(1);
            expect(result.pathLocationMap['a']._end).to.be.eq(23);

            expect(result.pathLocationMap['a/b']._start).to.be.eq(7);
            expect(result.pathLocationMap['a/b']._end).to.be.eq(23);

            expect(result.pathLocationMap['a/b/c']._start).to.be.eq(15);
            expect(result.pathLocationMap['a/b/c']._end).to.be.eq(23);

            expect(result.pathLocationMap['a'].start.line).to.be.eq(1);
            expect(result.pathLocationMap['a/b'].start.line).to.be.eq(2);
            expect(result.pathLocationMap['a/b/c'].start.line).to.be.eq(3);

            expect(result.pathLocationMap['d/0'].start.line).to.be.eq(5);
            expect(result.pathLocationMap['d/0'].start.column).to.be.eq(4);
            expect(result.pathLocationMap['d/0'].end.line).to.be.eq(5);
            expect(result.pathLocationMap['d/0'].end.column).to.be.eq(9);
        }else{
            expect(result.kind).to.eq(ParsedProjectSourceBaseKind.OBJECT);
        }
    });

    it('can extract the corresponding json data', () => {
        const source = new ProjectSource('test.yaml', yamlContent);
        const result = parseProjectSource(source);
        if(!result){
            expect(result).not.to.be.undefined;
            return;
        }


        if(result.kind == ParsedProjectSourceBaseKind.OBJECT){
            expect(result.object).to.deep.equals(correspondingObject);
        }else{
            expect(result.kind).to.eq(ParsedProjectSourceBaseKind.OBJECT);
        }
    });

});
