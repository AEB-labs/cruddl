import { describe, expect, it } from 'vitest';
import { ArangoDBAdapter } from '../../arangodb/arangodb-adapter.js';
import {
    type AddIndexQuickFixOptions,
    createAddIndexQuickFix,
} from '../../core/model/change-set/add-index-quick-fix.js';
import { applyChangeSet } from '../../core/model/change-set/apply-change-set.js';
import { Project } from '../../core/project/project.js';
import { ProjectSource } from '../../core/project/source.js';

const valueObjects = `
type Address @valueObject {
    country: String
    postalCode: String
}`;

const permissionProfiles = `permissionProfiles:
  default:
    permissions:
      - roles: [admin]
        access: readWrite
`;

function createProject(schema: string) {
    return new Project([
        new ProjectSource('schema.graphqls', schema + valueObjects),
        new ProjectSource('permission-profiles.yaml', permissionProfiles),
    ]);
}

function getQuickFix(
    schema: string,
    fieldPaths: string | ReadonlyArray<string>,
    options?: AddIndexQuickFixOptions,
) {
    const project = createProject(schema);
    const result = project.validate();
    expect(result.hasErrors(), result.toString()).to.be.false;
    const rootEntityType = project.getModel().getRootEntityTypeOrThrow('Delivery');
    return { project, quickFix: createAddIndexQuickFix(rootEntityType, fieldPaths, options) };
}

/**
 * Applies the quick fix, makes sure the result is valid and has the index
 *
 * @returns the new schema (without the value object types)
 */
function applyAddIndexQuickFix(
    schema: string,
    fieldPaths: string | ReadonlyArray<string>,
    options?: AddIndexQuickFixOptions,
) {
    const { project, quickFix } = getQuickFix(schema, fieldPaths, options);
    expect(quickFix).not.to.be.undefined;
    expect(quickFix!.kind).to.equal('ADD_INDEX');
    expect(quickFix!.isPreferred).to.be.false;

    const newProject = applyChangeSet(project, quickFix!.getChangeSet());
    const result = newProject.validate();
    expect(result.hasErrors(), result.toString()).to.be.false;

    const fields = typeof fieldPaths === 'string' ? [fieldPaths] : fieldPaths;
    const adapter = new ArangoDBAdapter({ url: 'http://localhost:1', databaseName: 'unused' });
    const indexes = adapter
        .getDatabaseObjects(newProject.getModel())
        .indexes.filter(
            (i) =>
                i.definition.type === 'persistent' &&
                !i.definition.unique &&
                i.definition.sparse === !!options?.sparse &&
                i.definition.fields.join(',') === fields.join(','),
        );
    expect(indexes).to.have.lengthOf(1);

    const body = newProject.sources.find((s) => s.name === 'schema.graphqls')!.body;
    return body.slice(0, body.length - valueObjects.length);
}

describe('createAddIndexQuickFix', () => {
    it('adds @index to a direct field', () => {
        const schema = `type Delivery @rootEntity {
    status: String
}`;
        expect(applyAddIndexQuickFix(schema, 'status')).to.equal(`type Delivery @rootEntity {
    status: String @index
}`);
    });

    it('adds @index after existing directives', () => {
        // the @key index is sparse, so it can't be used for sorting
        const schema = `type Delivery @rootEntity {
    deliveryNumber: String @key
}`;
        expect(applyAddIndexQuickFix(schema, 'deliveryNumber')).to
            .equal(`type Delivery @rootEntity {
    deliveryNumber: String @key @index
}`);
    });

    it('adds a sparse @index', () => {
        const schema = `type Delivery @rootEntity {
    status: String
}`;
        expect(applyAddIndexQuickFix(schema, 'status', { sparse: true })).to
            .equal(`type Delivery @rootEntity {
    status: String @index(sparse: true)
}`);
    });

    it('adds the indices argument to @rootEntity for a path into a value object', () => {
        const schema = `type Delivery @rootEntity {
    address: Address
}`;
        expect(applyAddIndexQuickFix(schema, 'address.country')).to
            .equal(`type Delivery @rootEntity(indices: [{ fields: ["address.country"] }]) {
    address: Address
}`);
    });

    it('adds the indices argument after existing arguments', () => {
        const schema = `type Delivery @rootEntity(flexSearch: true) {
    address: Address
}`;
        expect(applyAddIndexQuickFix(schema, 'address.country', { sparse: true })).to.equal(
            `type Delivery @rootEntity(flexSearch: true, indices: [{ fields: ["address.country"], sparse: true }]) {
    address: Address
}`,
        );
    });

    it('adds a multi-field index to an existing indices list', () => {
        const schema = `type Delivery @rootEntity(indices: [{ fields: ["status"] }]) {
    status: String
    address: Address
}`;
        expect(applyAddIndexQuickFix(schema, ['address.country', 'address.postalCode'])).to.equal(
            `type Delivery @rootEntity(indices: [{ fields: ["status"] }, { fields: ["address.country", "address.postalCode"] }]) {
    status: String
    address: Address
}`,
        );
    });

    it('fills an empty indices list', () => {
        const schema = `type Delivery @rootEntity(indices: []) {
    address: Address
}`;
        expect(applyAddIndexQuickFix(schema, 'address.country')).to
            .equal(`type Delivery @rootEntity(indices: [{ fields: ["address.country"] }]) {
    address: Address
}`);
    });

    it('turns a single index object into a list', () => {
        const schema = `type Delivery @rootEntity(indices: { fields: ["status"] }) {
    status: String
    address: Address
}`;
        expect(applyAddIndexQuickFix(schema, 'address.country')).to.equal(
            `type Delivery @rootEntity(indices: [{ fields: ["status"] }, { fields: ["address.country"] }]) {
    status: String
    address: Address
}`,
        );
    });

    it('uses the indices argument if the field already has a sparse @index', () => {
        const schema = `type Delivery @rootEntity {
    status: String @index(sparse: true)
}`;
        expect(applyAddIndexQuickFix(schema, 'status')).to
            .equal(`type Delivery @rootEntity(indices: [{ fields: ["status"] }]) {
    status: String @index(sparse: true)
}`);
    });

    it('returns undefined if the index already exists', () => {
        const schema = `type Delivery @rootEntity {
    status: String @index
}`;
        expect(getQuickFix(schema, 'status').quickFix).to.be.undefined;
        // cruddl adds an index on id by itself
        expect(getQuickFix(schema, 'id').quickFix).to.be.undefined;
    });

    it('returns undefined for an invalid path', () => {
        const schema = `type Delivery @rootEntity {
    address: Address
}`;
        expect(getQuickFix(schema, 'address.city').quickFix).to.be.undefined;
        expect(getQuickFix(schema, 'address').quickFix).to.be.undefined;
    });
});
