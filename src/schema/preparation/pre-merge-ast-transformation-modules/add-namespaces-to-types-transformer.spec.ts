import { Kind, parse } from 'graphql';
import { describe, expect, it } from 'vitest';
import { NAMESPACE_DIRECTIVE, ROOT_ENTITY_DIRECTIVE } from '../../constants.js';
import { findDirectiveWithName, getObjectTypes } from '../../schema-utils.js';
import { AddNamespacesToTypesTransformer } from './add-namespaces-to-types-transformer.js';

const modelWithRootEntity = `
            type Stuff @rootEntity {
                foo: String
            }
`;

const modelWithoutRootEntity = `
            type Stuff {
                foo: String
            }
`;

describe('add namespaces to types transformer', () => {
    it('adds local namespaces to object types', () => {
        const ast = parse(modelWithRootEntity);
        getObjectTypes(ast).forEach((objectType) => {
            expect(objectType.directives!.length).to.equal(1);
            expect(objectType.directives![0].name.value).to.equal(ROOT_ENTITY_DIRECTIVE);
        });
        const newAST = new AddNamespacesToTypesTransformer().transform(ast, {
            namespacePath: ['localNS'],
        });
        getObjectTypes(newAST).forEach((objectType) => {
            const namespaceDirective = findDirectiveWithName(objectType, NAMESPACE_DIRECTIVE);
            expect(namespaceDirective).to.not.be.undefined;
            const argValue = namespaceDirective!.arguments![0].value;
            if (argValue.kind !== Kind.STRING) {
                expect.fail('Expected argument of type String');
            } else {
                expect(argValue.value).to.equal('localNS');
            }
        });
    });

    it('ignores non root object types', () => {
        const ast = parse(modelWithoutRootEntity);
        getObjectTypes(ast).forEach((objectType) => {
            expect(objectType.directives!.length).to.equal(0);
        });
        const newAST = new AddNamespacesToTypesTransformer().transform(ast, {
            namespacePath: ['localNS'],
        });
        getObjectTypes(newAST).forEach((objectType) => {
            expect(objectType.directives!.length).to.equal(0);
        });
    });
});
