import { assertValidatorAccepts, assertValidatorRejects, validate } from './helpers';
import { expect } from 'chai';

describe('@root directive', () => {
    it('accepts direct embedding in root entity', () => {
        assertValidatorAccepts(`
            type Root @rootEntity {
                children: [Child]
            }

            type Child @childEntity {
                root: Root @root
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
                root: Root @root
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
                root: Root @root
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
                root: Root @root
            }

            type Child2 @childEntity {
                children: [Child3]
                root: Root @root
            }

            type Child3 @childEntity {
                extension: Extension4
                root: Root @root
            }

            type Extension4 @entityExtension {
                children: [Child4]
            }

            type Child4 @childEntity {
                root: Root @root
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
                root: Root @root
            }
        `);
    });

    it('accepts if embedded only by one entity type, but used with @collect in another', () => {
        assertValidatorAccepts(`
            type Root @rootEntity {
                children: [Child]
            }

            type Root2 @rootEntity {
                roots: [Root] @relation
                rootChildren: [Child] @collect(path: "roots.children")
            }

            type Child @childEntity {
                root: Root @root
            }
        `);
    });

    it('rejects with list', () => {
        assertValidatorRejects(
            `
            type Root @rootEntity {
                children: [Child]
            }

            type Child @childEntity {
                root: [Child] @root
            }
        `,
            `A root field cannot be a list.`
        );
    });

    it('rejects in root entity types', () => {
        assertValidatorRejects(
            `
            type Root @rootEntity {
                root: Root @root
            }
        `,
            `@root can only be used on fields of child entity types.`
        );
    });

    it('rejects in entity extensions', () => {
        assertValidatorRejects(
            `
            type Root @rootEntity {
                extension: Extension
            }

            type Extension @entityExtension {
                root: Root @root
            }
        `,
            `@root can only be used on fields of child entity types.`
        );
    });

    it('rejects in value object', () => {
        assertValidatorRejects(
            `
            type Root @rootEntity {
                objects: [ValueObject]
            }

            type ValueObject @valueObject {
                root: Root @root
            }
        `,
            `@root can only be used on fields of child entity types.`
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
                root: Root @root @reference
            }
        `,
            `@root and @reference cannot be combined.`
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
                root: [Grandchild] @root @collect(path: "children")
            }

            type Grandchild @childEntity {
                field: String
            }
        `,
            `@root and @collect cannot be combined.`
        );
    });

    it('rejects in combination with @flexSearch', () => {
        assertValidatorRejects(
            `
            type Root @rootEntity {
                children: [Child]
            }

            type Child @childEntity {
                root: Root @root @flexSearch
            }
        `,
            `@flexSearch is not supported on root fields.`
        );
    });

    it('rejects in combination with @flexSearchFulltext', () => {
        assertValidatorRejects(
            `
            type Root @rootEntity {
                children: [Child]
            }

            type Child @childEntity {
                root: Root @root @flexSearchFulltext
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
                root: Root @root @defaultValue(value: { })
            }
        `,
            `Default values are not supported on root fields.`
        );
    });

    it('rejects in combination with @parent', () => {
        assertValidatorRejects(
            `
            type Root @rootEntity {
                children: [Child]
            }

            type Child @childEntity {
                root: Root @root @parent
            }
        `,
            `@parent and @root cannot be combined.`
        );
    });

    it('rejects without usage', () => {
        assertValidatorRejects(
            `
            type Root @rootEntity {
                field: String
            }

            type Child @childEntity {
                root: Root @root
            }
        `,
            `Type "Child" is not used by any root entity type and therefore cannot have a root field.`
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
                root: Root2 @root
            }
        `,
            `Type "Child" is used in root entity type "Root1", so the type of this root field should be "Root1".`
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
                root: Root1 @root
            }
        `,
            `Type "Child" is used in root entity type "Root2" as well and thus cannot have a root field.`
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
                root: Root1 @root
            }
        `,
            `Type "Child" is used in root entity types "Root2" and "Root3" as well and thus cannot have a root field.`
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
                root: Root4 @root
            }
        `,
            `Type "Child" is used in multiple root entity types ("Root1", "Root2" and "Root3") and thus cannot have a root field.`
        );
    });

    it('rejects if type would only work with @collect', () => {
        assertValidatorRejects(
            `
            type Root @rootEntity {
                children: [Child]
            }

            type Root2 @rootEntity {
                roots: [Root] @relation
                rootChildren: [Child] @collect(path: "roots.children")
            }

            type Child @childEntity {
                root: Root2 @root
            }
        `,
            'Type "Child" is used in root entity type "Root", so the type of this root field should be "Root".'
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
                root: Extension1 @root
            }
        `,
            'Type "Child" is used in root entity type "Root", so the type of this root field should be "Root".'
        );
    });

    it('rejects multiple @root fields', () => {
        const result = validate(
            `
            type Root @rootEntity {
                children: [Child]
            }

            type Child @childEntity {
                root1: Root @root
                root2: Root @root
            }
        `
        );
        expect(result.hasErrors()).to.be.true;
        expect(result.messages.map(m => m.message)).to.deep.equal([
            `There can only be one root field per type.`,
            `There can only be one root field per type.`
        ]);
    });
});
