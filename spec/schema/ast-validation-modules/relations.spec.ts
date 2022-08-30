import { expect } from 'chai';
import { assertValidatorAccepts, assertValidatorRejects, validate } from './helpers';

describe('@relation', () => {
    it('allows CASCADE in forward relations', () => {
        assertValidatorAccepts(`
            type Parent @rootEntity {
                children: [Child] @relation(onDelete: CASCADE)
            }
            type Child @rootEntity {
                parent: Parent @relation(inverseOf: "children")
            }
        `);
    });

    it('allows RESTRICT in forward relations', () => {
        assertValidatorAccepts(`
            type Parent @rootEntity {
                children: [Child] @relation(onDelete: RESTRICT)
            }
            type Child @rootEntity {
                parent: Parent @relation(inverseOf: "children")
            }
        `);
    });

    it('allows RESTRICT in forward relations without inverse field', () => {
        assertValidatorAccepts(`
            type Parent @rootEntity {
                children: [Child] @relation(onDelete: RESTRICT)
            }
            type Child @rootEntity {
                name: String
            }
        `);
    });

    it('rejects onDelete in inverse relations', () => {
        assertValidatorRejects(
            `
            type Parent @rootEntity {
                children: [Child] @relation
            }
            type Child @rootEntity {
                parent: Parent @relation(inverseOf: "children", onDelete: CASCADE)
            }
        `,
            '"onDelete" cannot be specified on inverse relations.',
        );
    });

    it('rejects onDelete: REMOVE_EDGES in inverse relations', () => {
        // REMOVE_EDGES is the default, but re reject the argument altogether
        assertValidatorRejects(
            `
            type Parent @rootEntity {
                children: [Child] @relation
            }
            type Child @rootEntity {
                parent: Parent @relation(inverseOf: "children", onDelete: REMOVE_EDGES)
            }
        `,
            '"onDelete" cannot be specified on inverse relations.',
        );
    });

    it('rejects onDelete: CASCADE in implicit n-to-m relations', () => {
        assertValidatorRejects(
            `
            type Parent @rootEntity {
                children: [Child] @relation(onDelete: CASCADE)
            }
            type Child @rootEntity {
                name: String
            }
        `,
            '"CASCADE" is only supported on 1-to-n and 1-to-1 relations. Use "RESTRICT" instead or change this to a 1-to-n relation by adding a field with the @relation(inverseOf: "children") directive to the target type "Child".',
        );
    });

    it('rejects onDelete: CASCADE in implicit n-to-1 relations', () => {
        assertValidatorRejects(
            `
            type Parent @rootEntity {
                child: Child @relation(onDelete: CASCADE)
            }
            type Child @rootEntity {
                name: String
            }
        `,
            '"CASCADE" is only supported on 1-to-n and 1-to-1 relations. Use "RESTRICT" instead or change this to a 1-to-1 relation by adding a field with the @relation(inverseOf: "child") directive to the target type "Child".',
        );
    });

    it('rejects onDelete: CASCADE in explicit n-to-m relations', () => {
        assertValidatorRejects(
            `
            type Parent @rootEntity {
                children: [Child] @relation(onDelete: CASCADE)
            }
            type Child @rootEntity {
                parents: [Parent] @relation(inverseOf: "children")
            }
        `,
            '"CASCADE" is only supported on 1-to-n and 1-to-1 relations. Use "RESTRICT" instead or change this to a 1-to-n relation by changing the type of "Child.parents" to "Parent".',
        );
    });

    it('rejects onDelete: CASCADE in explicit 1-to-m relations', () => {
        assertValidatorRejects(
            `
            type Parent @rootEntity {
                child: Child @relation(onDelete: CASCADE)
            }
            type Child @rootEntity {
                parents: [Parent] @relation(inverseOf: "child")
            }
        `,
            '"CASCADE" is only supported on 1-to-n and 1-to-1 relations. Use "RESTRICT" instead or change this to a 1-to-1 relation by changing the type of "Child.parents" to "Parent".',
        );
    });

    it('allows RESTRICT in forward n-to-m relations', () => {
        assertValidatorAccepts(`
            type Parent @rootEntity {
                children: [Child] @relation(onDelete: RESTRICT)
            }
            type Child @rootEntity {
                parents: [Parent] @relation(inverseOf: "children")
            }
        `);
    });

    it('rejects onDelete: CASCADE on self-recursive fields', () => {
        assertValidatorRejects(
            `
            type Object @rootEntity {
                objects: [Object] @relation(onDelete: CASCADE)
            }
        `,
            '"CASCADE" cannot be used on recursive fields. Use "RESTRICT" instead.',
        );
    });

    it('rejects onDelete: CASCADE on indirectly recursive fields', () => {
        const errors = validate(
            `
            type Red @rootEntity {
                blues: [Blue] @relation(onDelete: CASCADE)
                parentBlue: Blue @relation(inverseOf: "reds")
            }

            type Blue @rootEntity {
                reds: [Red] @relation(onDelete: CASCADE)
                parentRed: Red @relation(inverseOf: "blues")
            }
        `,
        ).getErrors();
        expect(errors).to.have.length(2);
        expect(errors.map((e) => e.message)).to.deep.equal([
            'The path "blues.reds" is a loop with "onDelete: CASCADE" on each relation, which is not supported. Break the loop by replacing "CASCADE" with "RESTRICT" on any of these relations.',
            'The path "reds.blues" is a loop with "onDelete: CASCADE" on each relation, which is not supported. Break the loop by replacing "CASCADE" with "RESTRICT" on any of these relations.',
        ]);
    });

    it('allows relation loops if it is broken by a RESTRICT', () => {
        assertValidatorAccepts(`
            type Red @rootEntity {
                blues: [Blue] @relation(onDelete: CASCADE)
                parentBlue: Blue @relation(inverseOf: "reds")
            }
            type Blue @rootEntity {
                reds: Red @relation(onDelete: RESTRICT)
                parentRed: Red @relation(inverseOf: "blues")
            }
        `);
    });
});
