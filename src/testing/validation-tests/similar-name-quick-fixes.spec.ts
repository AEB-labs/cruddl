import { describe, expect, it } from 'vitest';
import { applyChangeSet } from '../../core/model/change-set/apply-change-set.js';
import { Project } from '../../core/project/project.js';
import { ProjectSource } from '../../core/project/source.js';

const schema = `
type Delivery @rootEntity(permissionProfile: "restricted") @businessObject {
    deliveryNumber: String @key
    accessGroup: String @accessField
    arrival: DateTime
    status: DeliveryStatus
    handlingUnits: [HandlingUnit] @relation
    processing: ProcessingInfo
}

type HandlingUnit @rootEntity {
    handlingUnitNumber: String
    delivery: Delivery @relation(inverseOf: "handlingUnits")
}

type ProcessingInfo @entityExtension {
    kind: DeliveryStatus
}

enum DeliveryStatus {
    DRAFT
    DELIVERED
}
`;

const permissionProfiles = `permissionProfiles:
  default:
    permissions:
      - roles: [admin]
        access: readWrite
  restricted:
    permissions:
      - roles: [customer]
        access: read
        restrictions:
          - field: accessGroup
            claim: accessGroups
`;

/**
 * Applies the quick fix with the given description to the source with the given name and makes sure
 * the project is valid afterwards
 */
function applyQuickFix(sources: Record<string, string>, sourceName: string, description: string) {
    const project = new Project(
        Object.entries(sources).map(([name, body]) => new ProjectSource(name, body)),
    );
    const messages = project.validate().messages;
    const quickFixes = messages
        .filter((m) => m.location?.sourceName === sourceName)
        .flatMap((m) => m.quickFixes);
    const quickFix = quickFixes.find((q) => q.description === description);
    expect(
        quickFix,
        `quick fixes: ${quickFixes.map((q) => q.description).join(', ')}; messages: ${messages.map((m) => m.message).join(', ')}`,
    ).not.to.be.undefined;
    const newProject = applyChangeSet(project, quickFix!.getChangeSet());
    const result = newProject.validate();
    expect(result.hasErrors(), result.toString()).to.be.false;
    return newProject.sources.find((s) => s.name === sourceName)!.body;
}

describe('similar-name quick fixes', () => {
    it('fixes field names in permission restrictions', () => {
        const body = applyQuickFix(
            {
                'schema.graphqls': schema,
                'permission-profiles.yaml': permissionProfiles.replace(
                    'field: accessGroup',
                    'field: accesGroup',
                ),
            },
            'permission-profiles.yaml',
            'Change to "accessGroup"',
        );
        expect(body).to.equal(permissionProfiles);
    });

    it('fixes field names in TTL cascadeFields', () => {
        const ttl = `timeToLive:
  - typeName: Delivery
    dateField: arrival
    expireAfterDays: 3
    cascadeFields:
      - handlingUnits
`;
        const body = applyQuickFix(
            {
                'schema.graphqls': schema,
                'permission-profiles.yaml': permissionProfiles,
                'ttl.yaml': ttl.replace('- handlingUnits', '- handlingunits'),
            },
            'ttl.yaml',
            'Change to "handlingUnits"',
        );
        expect(body).to.equal(ttl);
    });

    it('fixes field names in billing category mappings', () => {
        const billing = JSON.stringify(
            {
                billing: {
                    billingEntities: [
                        {
                            typeName: 'Delivery',
                            categoryMapping: {
                                fieldName: 'processing.kind',
                                defaultValue: 'standard',
                                values: { DRAFT: 'draft' },
                            },
                        },
                    ],
                },
            },
            undefined,
            4,
        );
        const body = applyQuickFix(
            {
                'schema.graphqls': schema,
                'permission-profiles.yaml': permissionProfiles,
                'billing.json': billing.replace('processing.kind', 'procesing.kind'),
            },
            'billing.json',
            'Change to "processing"',
        );
        expect(body).to.equal(billing);
    });

    it('fixes field names in collect paths', () => {
        const body = applyQuickFix(
            {
                'schema.graphqls': schema.replace(
                    '    processing: ProcessingInfo\n',
                    '    processing: ProcessingInfo\n    handlingUnitNumbers: [String] @collect(path: "handlingUnits.handlingUnitNumbr", aggregate: DISTINCT)\n',
                ),
                'permission-profiles.yaml': permissionProfiles,
            },
            'schema.graphqls',
            'Change to "handlingUnitNumber"',
        );
        expect(body).to.contain(
            '@collect(path: "handlingUnits.handlingUnitNumber", aggregate: DISTINCT)',
        );
    });

    it('fixes type names in TTL configs', () => {
        const ttl = `timeToLive:
  - typeName: Delivery
    dateField: arrival
    expireAfterDays: 3
`;
        const body = applyQuickFix(
            {
                'schema.graphqls': schema,
                'permission-profiles.yaml': permissionProfiles,
                'ttl.yaml': ttl.replace('typeName: Delivery', 'typeName: Delivry'),
            },
            'ttl.yaml',
            'Change to "Delivery"',
        );
        expect(body).to.equal(ttl.replace('typeName: Delivery', 'typeName: "Delivery"'));
    });

    it('fixes type names and key fields in billing configs', () => {
        const billing = JSON.stringify(
            {
                billing: {
                    billingEntities: [{ typeName: 'Delivery', keyFieldName: 'deliveryNumber' }],
                },
            },
            undefined,
            4,
        );
        const sources = {
            'schema.graphqls': schema,
            'permission-profiles.yaml': permissionProfiles,
        };
        expect(
            applyQuickFix(
                { ...sources, 'billing.json': billing.replace('"Delivery"', '"delivery"') },
                'billing.json',
                'Change to "Delivery"',
            ),
        ).to.equal(billing);
        expect(
            applyQuickFix(
                { ...sources, 'billing.json': billing.replace('deliveryNumber', 'deliveryNumbr') },
                'billing.json',
                'Change to "deliveryNumber"',
            ),
        ).to.equal(billing);
    });
});
