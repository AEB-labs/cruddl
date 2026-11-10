import { graphql } from 'graphql';
import { describe, expect, it } from 'vitest';
import { ArangoDBAdapter } from '../../arangodb/arangodb-adapter.js';
import { isArangoDBDisabled } from '../../arangodb/testing/is-arangodb-disabled.js';
import type { AuthContext } from '../../core/authorization/auth-basics.js';
import { getPermissionDenial } from '../../core/authorization/permission-denial.js';
import type { DatabaseAdapter } from '../../core/database/database-adapter.js';
import { Project } from '../../core/project/project.js';
import { ProjectSource } from '../../core/project/source.js';
import { InMemoryAdapter } from '../../inmemory/inmemory-adapter.js';
import { createTempDatabase } from '../regression-tests/initialization.js';

const adapters: ReadonlyArray<{
    readonly name: string;
    readonly skip: boolean;
    readonly create: () => Promise<DatabaseAdapter>;
}> = [
    { name: 'InMemoryAdapter', skip: false, create: async () => new InMemoryAdapter() },
    {
        name: 'ArangoDBAdapter',
        skip: isArangoDBDisabled(),
        create: async () => new ArangoDBAdapter(await createTempDatabase()),
    },
];

describe.each(adapters)('permission denied errors ($name)', ({ skip, create }) => {
    const schemaSource = `
        type File @rootEntity(permissionProfile: "files") {
            name: String
            customer: String @accessField
            secret: String @roles(read: "admin")
        }
    `;
    const permissionProfiles = {
        permissionProfiles: {
            files: {
                permissions: [
                    { roles: ['writer'], access: 'readWrite' },
                    {
                        roles: ['customer'],
                        access: 'readWrite',
                        restrictions: [{ field: 'customer', claim: 'customerId' }],
                    },
                ],
            },
        },
    };

    async function createSchema() {
        let authContext: AuthContext = {};
        const project = new Project({
            sources: [
                new ProjectSource('schema.graphql', schemaSource),
                new ProjectSource('permission-profiles.json', JSON.stringify(permissionProfiles)),
            ],
            getExecutionOptions: () => ({ authContext }),
        });
        const db = await create();
        const schema = project.createSchema(db);
        await db.updateSchema(project.getModel());
        return async (context: AuthContext, source: string) => {
            authContext = context;
            return graphql({ schema, source, rootValue: {} });
        };
    }

    it.skipIf(skip)('identifies denied reads of types without exposing it to clients', async () => {
        const run = await createSchema();
        const result = await run({ authRoles: ['other'] }, `{ allFiles { name } }`);
        expect(result.errors?.map((e) => e.message)).to.deep.equal([
            'Not authorized to read File objects',
        ]);
        expect(getPermissionDenial(result.errors?.[0])).to.deep.equal({
            operation: 'READ',
            typeName: 'File',
        });
        expect(result.errors?.[0].toJSON().extensions).to.deep.equal({
            code: 'PERMISSION_DENIED',
        });
    });

    it.skipIf(skip)('identifies denied reads of fields', async () => {
        const run = await createSchema();
        const result = await run({ authRoles: ['writer'] }, `{ allFiles { secret } }`);
        // no objects, so the field error does not occur
        expect(result.errors).to.be.undefined;
        await run(
            { authRoles: ['writer'] },
            `mutation { createFile(input: { name: "a", customer: "c1" }) { id } }`,
        );
        const result2 = await run({ authRoles: ['writer'] }, `{ allFiles { secret } }`);
        expect(getPermissionDenial(result2.errors?.[0])).to.deep.equal({
            operation: 'READ',
            typeName: 'File',
            fieldName: 'secret',
        });
    });

    it.skipIf(skip)('identifies mutations denied while they are executed', async () => {
        const run = await createSchema();
        const createResult: any = await run(
            { authRoles: ['writer'] },
            `mutation { createFile(input: { name: "a", customer: "c1" }) { id } }`,
        );
        const id = createResult.data.createFile.id;
        const result = await run(
            { authRoles: ['customer'], claims: { customerId: 'c1' } },
            `mutation { updateFile(input: { id: "${id}", customer: "c2" }) { id } }`,
        );
        expect(result.errors?.[0].message).to.equal(
            'Not authorized to set File.customer to this value',
        );
        expect(getPermissionDenial(result.errors?.[0])).to.deep.equal({
            operation: 'UPDATE',
            typeName: 'File',
        });
    });

    it.skipIf(skip)('returns undefined for other errors', async () => {
        expect(getPermissionDenial(new Error('test'))).to.be.undefined;
        expect(getPermissionDenial(undefined)).to.be.undefined;
    });
});
