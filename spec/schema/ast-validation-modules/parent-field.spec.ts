import {
    assertValidatorAccepts,
    assertValidatorAcceptsAndDoesNotWarn,
    assertValidatorRejects,
    assertValidatorWarns,
    validate
} from './helpers';
import { expect } from 'chai';

describe('@parent directive', () => {
    it('accepts direct embedding in root entity', () => {
        assertValidatorAccepts(`
            type Root @rootEntity {
                children: [Child]
            }

            type Child @childEntity {
                name: String
                parent: Root @parent
            }
        `);
    });

    it('accepts embedding in other child entity', () => {
        assertValidatorAccepts(`
            type Root @rootEntity {
                children: [Child]
            }

            type Child @childEntity {
                children: [Grandchild]
            }

            type Grandchild @childEntity {
                name: String
                parent: Child @parent
            }
        `);
    });

    it('accepts embedding with entity extension in between', () => {
        assertValidatorAccepts(`
            type Root @rootEntity {
                extension: Extension
            }

            type Extension @entityExtension {
                children: [Child]
            }

            type Child @childEntity {
                name: String
                parent: Root @parent
            }
        `);
    });

    it('accepts embedding nested with multiple extension in between', () => {
        assertValidatorAccepts(`
            type Root @rootEntity {
                extension: Extension1
            }

            type Extension1 @entityExtension {
                extension2: Extension2
            }

            type Extension2 @entityExtension {
                extension3: Extension3
            }

            type Extension3 @entityExtension {
                children: [Child1]
            }

            type Child1 @childEntity {
                children: [Child2]
                parent: Root @parent
            }

            type Child2 @childEntity {
                children: [Child3]
                parent: Child1 @parent
            }

            type Child3 @childEntity {
                extension: Extension4
                parent: Child2 @parent
            }

            type Extension4 @entityExtension {
                children: [Child4]
            }

            type Child4 @childEntity {
                name: String
                parent: Child3 @parent
            }
        `);
    });

    it('accepts embedding in multiple fields with the same type', () => {
        assertValidatorAccepts(`
            type Root @rootEntity {
                children1: [Child]
                children2: [Child]
                extension: Extension
            }

            type Extension @entityExtension {
                children: [Child]
            }

            type Child @childEntity {
                name: String
                parent: Root @parent
            }
        `);
    });

    it('accepts if embedded only by one entity type, but used with @collect in another', () => {
        assertValidatorAccepts(`
            type Root @rootEntity {
                children: [Child]
                grandchildren: [Grandchild] @collect(path: "children.children")
            }

            type Child @childEntity {
                children: [Grandchild]
            }

            type Grandchild @childEntity {
                name: String
                parent: Child @parent
            }
        `);
    });

    it('rejects with list', () => {
        assertValidatorRejects(
            `
            type Child @childEntity {
                name: String
                parent: [Child] @parent
            }
        `,
            `A parent field cannot be a list.`
        );
    });

    it('rejects in root entity types', () => {
        assertValidatorRejects(
            `
            type Root @rootEntity {
                name: String
                parent: Root @parent
            }
        `,
            `@parent can only be used on fields of child entity types.`
        );
    });

    it('rejects in entity extensions', () => {
        assertValidatorRejects(
            `
            type Root @rootEntity {
                extension: Extension
            }

            type Extension @entityExtension {
                name: String
                parent: Root @parent
            }
        `,
            `@parent can only be used on fields of child entity types.`
        );
    });

    it('rejects in value object', () => {
        assertValidatorRejects(
            `
            type Root @rootEntity {
                objects: [ValueObject]
            }

            type ValueObject @valueObject {
                name: String
                parent: Root @parent
            }
        `,
            `@parent can only be used on fields of child entity types.`
        );
    });

    it('rejects if there is nothing but parent and root fields in a child entity', () => {
        assertValidatorRejects(
            `
            type Root @rootEntity {
                child: [Child]
            }

            type Child @childEntity {
                parent: Root @parent
                root: Root @root
            }
        `,
            `There need to be fields other than parent and root fields in a child entity type.`
        );
    });

    it('rejects in combination with @reference', () => {
        assertValidatorRejects(
            `
            type Root @rootEntity {
                children: [Child]
                key: String @key
            }

            type Child @childEntity {
                name: String
                parent: Root @parent @reference
            }
        `,
            `@parent and @reference cannot be combined.`
        );
    });

    it('rejects in combination with @collect', () => {
        assertValidatorRejects(
            `
            type Root @rootEntity {
                children: [Child]
            }

            type Child @childEntity {
                children: [Grandchild]
                parent: [Grandchild] @parent @collect(path: "children")
            }

            type Grandchild @childEntity {
                field: String
            }
        `,
            `@parent and @collect cannot be combined.`
        );
    });

    it('rejects in combination with @flexSearch', () => {
        assertValidatorRejects(
            `
            type Root @rootEntity {
                children: [Child]
            }

            type Child @childEntity {
                name: String
                parent: Root @parent @flexSearch
            }
        `,
            `@flexSearch is not supported on parent fields.`
        );
    });

    it('rejects in combination with @flexSearchFulltext', () => {
        assertValidatorRejects(
            `
            type Root @rootEntity {
                children: [Child]
            }

            type Child @childEntity {
                name: String
                parent: Root @parent @flexSearchFulltext
            }
        `,
            `@flexSearchFulltext is not supported on type "Root".`
        );
    });

    it('rejects in combination with @defaultValue', () => {
        assertValidatorRejects(
            `
            type Root @rootEntity {
                children: [Child]
            }

            type Child @childEntity {
                name: String
                parent: Root @parent @defaultValue(value: { })
            }
        `,
            `Default values are not supported on parent fields.`
        );
    });

    it('rejects without usage', () => {
        assertValidatorRejects(
            `
            type Root @rootEntity {
                field: String
            }

            type Child @childEntity {
                name: String
                parent: Root @parent
            }
        `,
            `Type "Child" is not used by any entity type and therefore cannot have a parent field.`
        );
    });

    it('rejects with wrong type', () => {
        assertValidatorRejects(
            `
            type Root1 @rootEntity {
                children: [Child]
            }

            type Root2 @rootEntity {
                otherField: String
            }

            type Child @childEntity {
                name: String
                parent: Root2 @parent
            }
        `,
            `Type "Child" is used in entity type "Root1", so the type of this parent field should be "Root1".`
        );
    });

    it('rejects with another possible types', () => {
        assertValidatorRejects(
            `
            type Root1 @rootEntity {
                children: [Child]
            }

            type Root2 @rootEntity {
                children: [Child]
            }

            type Child @childEntity {
                name: String
                parent: Root1 @parent
            }
        `,
            `Type "Child" is used in entity type "Root2" as well and thus cannot have a parent field.`
        );
    });

    it('rejects for recursive child entities', () => {
        assertValidatorRejects(
            `
            type Root @rootEntity {
                children: [Child]
            }

            type Child @childEntity {
                children: [Child]
                parent: Root @parent
            }
        `,
            `Type "Child" is a recursive child entity type and therefore cannot have a parent field. Use the @root directive instead.`
        );
    });

    it('rejects with other possible types', () => {
        assertValidatorRejects(
            `
            type Root1 @rootEntity {
                children: [Child]
            }

            type Root2 @rootEntity {
                children: [Child]
            }

            type Root3 @rootEntity {
                children: [Child]
            }

            type Child @childEntity {
                name: String
                parent: Root1 @parent
            }
        `,
            `Type "Child" is used in entity types "Root2" and "Root3" as well and thus cannot have a parent field.`
        );
    });

    it('rejects with other possible types when types would not work at all', () => {
        assertValidatorRejects(
            `
            type Root1 @rootEntity {
                children: [Child]
            }

            type Root2 @rootEntity {
                children: [Child]
            }

            type Root3 @rootEntity {
                children: [Child]
            }

            type Root4 @rootEntity {
                field: String
            }

            type Child @childEntity {
                name: String
                parent: Root4 @parent
            }
        `,
            `Type "Child" is used in multiple entity types ("Root1", "Root2" and "Root3") and thus cannot have a parent field.`
        );
    });

    it('rejects with multiple possible types through extensions', () => {
        assertValidatorRejects(
            `
            type Root1 @rootEntity {
                children: [Child]
                extension: Extension
            }

            type Child @childEntity {
                name: String
                parent: Root1 @parent
            }

            type Extension @entityExtension {
                children: [Child2]
            }

            type Child2 @childEntity {
                children: [Child]
            }
        `,
            `Type "Child" is used in entity type "Child2" as well and thus cannot have a parent field.`
        );
    });

    it('rejects if type would only work with @collect', () => {
        assertValidatorRejects(
            `
            type Root @rootEntity {
                children: [Child]
                grandchildren: [Grandchild] @collect(path: "children.children")
            }

            type Child @childEntity {
                children: [Grandchild]
            }

            type Grandchild @childEntity {
                name: String
                parent: Root @parent
            }
        `,
            'Type "Grandchild" is used in entity type "Child", so the type of this parent field should be "Child".'
        );
    });

    it('rejects if entity embedding extension is used instead', () => {
        assertValidatorRejects(
            `
            type Root @rootEntity {
                extension: Extension1
            }

            type Extension1 @entityExtension {
                extension: Extension2
            }

            type Extension2 @entityExtension {
                children: [Child]
            }

            type Child @childEntity {
                name: String
                parent: Extension1 @parent
            }
        `,
            'Type "Child" is used in type "Extension1", but the closest entity type in the hierarchy is "Root", so the type of this parent field should be "Root".'
        );
    });

    it('rejects multiple @parent fields', () => {
        const result = validate(
            `
            type Root @rootEntity {
                children: [Child]
            }

            type Child @childEntity {
                name: String
                parent1: Root @parent
                parent2: Root @parent
            }
        `
        );
        expect(result.hasErrors()).to.be.true;
        expect(result.messages.map(m => m.message)).to.deep.equal([
            `There can only be one parent field per type.`,
            `There can only be one parent field per type.`
        ]);
    });

    it('warns about @parent usage', () => {
        assertValidatorWarns(
            `
            type Root @rootEntity {
                children: [Child]
            }

            type Child @childEntity {
                name: String
                children: [Grandchild]
            }

            type Grandchild @childEntity {
                name: String
                parent: Child @parent
            }
        `,
            'Parent fields currently can\'t be selected within collect fields, so this field will probably be useless. You could add a @root field (of type "Root") instead.'
        );
    });

    it('does not warn about @parent usage that is essential a @root', () => {
        assertValidatorAcceptsAndDoesNotWarn(
            `
            type Root @rootEntity {
                children: [Child]
            }

            type Child @childEntity {
                name: String
                parent: Root @parent
            }
        `
        );
    });
});
