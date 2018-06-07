import { parse } from 'graphql';
import { findDirectiveWithName, getObjectTypes } from '../../../../src/schema/schema-utils';
import { AddNamespacesToTypesTransformer } from '../../../../src/schema/preparation/pre-merge-ast-transformation-modules/add-namespaces-to-types-transformer';
import { NAMESPACE_DIRECTIVE, ROOT_ENTITY_DIRECTIVE } from '../../../../src/schema/constants';
import { STRING } from '../../../../src/graphql/kinds';
import { expect } from 'chai';

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
        getObjectTypes(ast).forEach(objectType => {
            expect(objectType.directives!.length).to.equal(1);
            expect(objectType.directives![0].name.value).to.equal(ROOT_ENTITY_DIRECTIVE);
        });
        const newAST = new AddNamespacesToTypesTransformer().transform(ast, {localNamespace: 'localNS'});
        getObjectTypes(newAST).forEach(objectType => {
            const namespaceDirective = findDirectiveWithName(objectType, NAMESPACE_DIRECTIVE);
            expect(namespaceDirective).to.not.be.undefined;
            const argValue = namespaceDirective!.arguments![0].value;
            if (argValue.kind !== STRING) {
                expect.fail('Expected argument of type String');
            } else {
                expect(argValue.value).to.equal('localNS')
            }
        });
    });

    it('adds default namespaces to object types', () => {
        const ast = parse(modelWithRootEntity);
        getObjectTypes(ast).forEach(objectType => {
            expect(objectType.directives!.length).to.equal(1);
            expect(objectType.directives![0].name.value).to.equal(ROOT_ENTITY_DIRECTIVE);
        });
        const newAST = new AddNamespacesToTypesTransformer().transform(ast, {defaultNamespace: 'someNS'});
        getObjectTypes(newAST).forEach(objectType => {
            const namespaceDirective = findDirectiveWithName(objectType, NAMESPACE_DIRECTIVE);
            expect(namespaceDirective).to.not.be.undefined;
            const argValue = namespaceDirective!.arguments![0].value;
            if (argValue.kind !== STRING) {
                expect.fail('Expected argument of type String');
            } else {
                expect(argValue.value).to.equal('someNS')
            }
        });
    });

    it('local namespace wins over default namespace', () => {
        const ast = parse(modelWithRootEntity);
        getObjectTypes(ast).forEach(objectType => {
            expect(objectType.directives!.length).to.equal(1);
            expect(objectType.directives![0].name.value).to.equal(ROOT_ENTITY_DIRECTIVE);
        });
        const newAST = new AddNamespacesToTypesTransformer().transform(ast, {localNamespace: 'localNS', defaultNamespace: 'defaultNS'});
        getObjectTypes(newAST).forEach(objectType => {
            const namespaceDirective = findDirectiveWithName(objectType, NAMESPACE_DIRECTIVE);
            expect(namespaceDirective).to.not.be.undefined;
            const argValue = namespaceDirective!.arguments![0].value;
            if (argValue.kind !== STRING) {
                expect.fail('Expected argument of type String');
            } else {
                expect(argValue.value).to.equal('localNS')
            }
        });
    });

    it('ignores non root object types', () => {
        const ast = parse(modelWithoutRootEntity);
        getObjectTypes(ast).forEach(objectType => {
            expect(objectType.directives!.length).to.equal(0);
        });
        const newAST = new AddNamespacesToTypesTransformer().transform(ast, {localNamespace: 'localNS', defaultNamespace: 'defaultNS'});
        getObjectTypes(newAST).forEach(objectType => {
            expect(objectType.directives!.length).to.equal(0);
        });
    });
});
