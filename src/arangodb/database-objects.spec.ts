import { describe, expect, it } from 'vitest';
import type { IndexOrigin } from '../core/model/implementation/index-origin.js';
import { Project } from '../core/project/project.js';
import { ProjectSource } from '../core/project/source.js';
import { ArangoDBAdapter } from './arangodb-adapter.js';
import type { ModelDatabaseIndex } from './database-objects.js';
import { getRequiredIndicesFromModel } from './schema-migration/index-helpers.js';

const schema = `
type Delivery @rootEntity(flexSearch: true, indices: [{ fields: ["address.country", "address.postalCode"] }]) {
    deliveryNumber: String @key
    trackingNumber: String @unique
    status: String @index(sparse: true)
    arrival: DateTime
    address: Address
    embedding: [Float] @vectorIndex(dimension: 3, defaultNProbe: 1, maxNProbe: 2)
    handlingUnits: [HandlingUnit] @relation
}

type HandlingUnit @rootEntity {
    huNumber: String
}

type Address @valueObject {
    country: String
    postalCode: String
}
`;

const permissionProfiles = `permissionProfiles:
  default:
    permissions:
      - roles: [admin]
        access: readWrite
`;

const ttl = `timeToLive:
  - typeName: Delivery
    dateField: arrival
    expireAfterDays: 3
`;

function getModel() {
    const project = new Project([
        new ProjectSource('schema.graphqls', schema),
        new ProjectSource('permission-profiles.yaml', permissionProfiles),
        new ProjectSource('ttl.yaml', ttl),
    ]);
    const result = project.validate();
    expect(result.hasErrors(), result.toString()).to.be.false;
    return project.getModel();
}

function getAdapter(collectionNamePrefix?: string) {
    // getDatabaseObjects does not access the database
    return new ArangoDBAdapter({
        url: 'http://localhost:1',
        databaseName: 'unused',
        collectionNamePrefix,
    });
}

function describeIndex({ definition, origin }: ModelDatabaseIndex) {
    const flags = [
        definition.type,
        definition.type === 'persistent' && definition.unique ? 'unique' : undefined,
        definition.sparse ? 'sparse' : undefined,
    ].filter((f) => f !== undefined);
    return `${definition.collectionName} ${definition.fields.join(',')} (${flags.join(' ')}) <- ${describeOrigin(origin)}`;
}

function describeOrigin(origin: IndexOrigin) {
    const location = origin.location
        ? `${origin.location.sourceName}:${origin.location.start.line}:${origin.location.start.column}`
        : 'no location';
    switch (origin.kind) {
        case 'key':
        case 'fieldDirective':
        case 'discriminator':
        case 'vectorIndex':
            return `${origin.kind} ${origin.rootEntityType.name}.${origin.field.name} at ${location}`;
        case 'timeToLive':
            return `${origin.kind} ${origin.timeToLiveType.input.typeName} at ${location}`;
        case 'rootEntityIndices':
            return `${origin.kind} ${origin.rootEntityType.name} at ${location}`;
    }
}

describe('ArangoDBAdapter.getDatabaseObjects', () => {
    it('lists collections of root entities, relations and billing entities', () => {
        const model = getModel();
        const objects = getAdapter().getDatabaseObjects(model);
        expect(
            objects.collections.map(
                (c) =>
                    `${c.name}: ${c.rootEntityType?.name ?? '-'} / ${c.relation ? c.relation.fromType.name + '.' + c.relation.fromField.name : '-'}`,
            ),
        ).to.deep.equal([
            'deliveries: Delivery / -',
            'handlingUnits: HandlingUnit / -',
            'deliveries_handlingUnits: - / Delivery.handlingUnits',
            'billingEntities: - / -',
        ]);
    });

    it('lists flexSearch views', () => {
        const model = getModel();
        const objects = getAdapter().getDatabaseObjects(model);
        expect(objects.views.map((v) => `${v.name}: ${v.rootEntityType.name}`)).to.deep.equal([
            'flex_view_deliveries: Delivery',
        ]);
    });

    it('lists indexes with their origin', () => {
        const model = getModel();
        const objects = getAdapter().getDatabaseObjects(model);
        expect(objects.indexes.map(describeIndex)).to.deep.equal([
            'deliveries address.country,address.postalCode (persistent) <- rootEntityIndices Delivery at schema.graphqls:2:55',
            'deliveries status (persistent sparse) <- fieldDirective Delivery.status at schema.graphqls:5:20',
            'deliveries trackingNumber (persistent unique sparse) <- fieldDirective Delivery.trackingNumber at schema.graphqls:4:28',
            'deliveries deliveryNumber (persistent unique sparse) <- key Delivery.deliveryNumber at schema.graphqls:3:28',
            'deliveries arrival (persistent) <- timeToLive Delivery at ttl.yaml:3:5',
            'deliveries _key (persistent) <- discriminator Delivery.id at no location',
            'handlingUnits _key (persistent) <- discriminator HandlingUnit.id at no location',
            'deliveries embedding (vector sparse) <- vectorIndex Delivery.embedding at schema.graphqls:8:24',
        ]);
    });

    it('describes vector indexes with the parameters from the model', () => {
        const model = getModel();
        const vectorIndex = getAdapter()
            .getDatabaseObjects(model)
            .indexes.find((i) => i.definition.type === 'vector');
        expect(vectorIndex?.definition).to.deep.equal({
            collectionName: 'deliveries',
            type: 'vector',
            fields: ['embedding'],
            sparse: true,
            params: {
                metric: 'cosine',
                dimension: 3,
                nLists: undefined,
                trainingIterations: undefined,
                factory: undefined,
            },
            storedValues: undefined,
        });
    });

    it('uses the same index definitions as the migrations', () => {
        const model = getModel();
        const persistentIndexes = getAdapter('app_')
            .getDatabaseObjects(model)
            .indexes.filter((i) => i.definition.type === 'persistent')
            .map((i) => i.definition);
        expect(persistentIndexes).to.deep.equal(
            getRequiredIndicesFromModel(model, { prefix: 'app_' }),
        );
    });

    it('applies the collectionNamePrefix', () => {
        const model = getModel();
        const objects = getAdapter('app_').getDatabaseObjects(model);
        expect(objects.collections.map((c) => c.name)).to.deep.equal([
            'app_deliveries',
            'app_handlingUnits',
            'app_deliveries_handlingUnits',
            'app_billingEntities',
        ]);
        expect(objects.views.map((v) => v.name)).to.deep.equal(['app_flex_view_deliveries']);
        expect([...new Set(objects.indexes.map((i) => i.definition.collectionName))]).to.deep.equal(
            ['app_deliveries', 'app_handlingUnits'],
        );
    });

    it('reports an index declared multiple times with the explicit declaration', () => {
        const project = new Project([
            new ProjectSource(
                'schema.graphqls',
                `type Delivery @rootEntity {
                    arrival: DateTime @index
                }`,
            ),
            new ProjectSource('permission-profiles.yaml', permissionProfiles),
            new ProjectSource('ttl.yaml', ttl),
        ]);
        const objects = getAdapter().getDatabaseObjects(project.getModel());
        expect(objects.indexes.map((i) => i.origin.kind)).to.deep.equal([
            'fieldDirective',
            'discriminator',
        ]);
    });
});
