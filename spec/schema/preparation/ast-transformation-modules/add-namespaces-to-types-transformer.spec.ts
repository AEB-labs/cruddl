import {parse} from "graphql";
import {findDirectiveWithName, getObjectTypes} from "../../../../src/schema/schema-utils";
import {AddNamespacesToTypesTransformer} from "../../../../src/schema/preparation/pre-merge-ast-transformation-modules/add-namespaces-to-types-transformer";
import {NAMESPACE_DIRECTIVE, ROOT_ENTITY_DIRECTIVE} from "../../../../src/schema/schema-defaults";
import {STRING} from "graphql/language/kinds";

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
            expect(objectType.directives!.length).toBe(1);
            expect(objectType.directives![0].name.value).toBe(ROOT_ENTITY_DIRECTIVE);
        });
        new AddNamespacesToTypesTransformer().transform(ast, {localNamespace: 'localNS'});
        getObjectTypes(ast).forEach(objectType => {
            const namespaceDirective = findDirectiveWithName(objectType, NAMESPACE_DIRECTIVE);
            expect(namespaceDirective).toBeDefined();
            const argValue = namespaceDirective!.arguments![0].value;
            if (argValue.kind !== STRING) {
                fail('Expected argument of type String');
            } else {
                expect(argValue.value).toBe('localNS')
            }
        });
    });

    it('adds default namespaces to object types', () => {
        const ast = parse(modelWithRootEntity);
        getObjectTypes(ast).forEach(objectType => {
            expect(objectType.directives!.length).toBe(1);
            expect(objectType.directives![0].name.value).toBe(ROOT_ENTITY_DIRECTIVE);
        });
        new AddNamespacesToTypesTransformer().transform(ast, {defaultNamespace: 'someNS'});
        getObjectTypes(ast).forEach(objectType => {
            const namespaceDirective = findDirectiveWithName(objectType, NAMESPACE_DIRECTIVE);
            expect(namespaceDirective).toBeDefined();
            const argValue = namespaceDirective!.arguments![0].value;
            if (argValue.kind !== STRING) {
                fail('Expected argument of type String');
            } else {
                expect(argValue.value).toBe('someNS')
            }
        });
    });

    it('local namespace wins over default namespace', () => {
        const ast = parse(modelWithRootEntity);
        getObjectTypes(ast).forEach(objectType => {
            expect(objectType.directives!.length).toBe(1);
            expect(objectType.directives![0].name.value).toBe(ROOT_ENTITY_DIRECTIVE);
        });
        new AddNamespacesToTypesTransformer().transform(ast, {localNamespace: 'localNS', defaultNamespace: 'defaultNS'});
        getObjectTypes(ast).forEach(objectType => {
            const namespaceDirective = findDirectiveWithName(objectType, NAMESPACE_DIRECTIVE);
            expect(namespaceDirective).toBeDefined();
            const argValue = namespaceDirective!.arguments![0].value;
            if (argValue.kind !== STRING) {
                fail('Expected argument of type String');
            } else {
                expect(argValue.value).toBe('localNS')
            }
        });
    });

    it('ignores non root object types', () => {
        const ast = parse(modelWithoutRootEntity);
        getObjectTypes(ast).forEach(objectType => {
            expect(objectType.directives!.length).toBe(0);
        });
        new AddNamespacesToTypesTransformer().transform(ast, {localNamespace: 'localNS', defaultNamespace: 'defaultNS'});
        getObjectTypes(ast).forEach(objectType => {
            expect(objectType.directives!.length).toBe(0);
        });
    });
});
