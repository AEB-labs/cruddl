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
 * Makes sure the project has exactly the given messages, applies the quick fix with the given
 * description in the source with the given name and makes sure the project is valid afterwards
 *
 * @param expectedMessages the messages, prefixed with the source name (e.g. "ttl.yaml: ...")
 * @returns the new body of the source with the given name
 */
function applyQuickFix(
    sources: Record<string, string>,
    sourceName: string,
    expectedMessages: ReadonlyArray<string>,
    description: string,
) {
    const project = new Project(
        Object.entries(sources).map(([name, body]) => new ProjectSource(name, body)),
    );
    const messages = project.validate().messages;
    expect(messages.map((m) => `${m.location?.sourceName}: ${m.message}`)).to.deep.equal(
        expectedMessages,
    );
    const quickFixes = messages
        .filter((m) => m.location?.sourceName === sourceName)
        .flatMap((m) => m.quickFixes)
        .filter((q) => q.description === description);
    expect(quickFixes).to.have.lengthOf(1);
    const quickFix = quickFixes[0];
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
            [
                'schema.graphqls: @accessField has no effect because field "Delivery.accessGroup" is not used in a restriction of a permission profile. Note that @accessField makes flexSearch filters on this field case-sensitive.',
                'schema.graphqls: Permission profile "restricted" defines restrictions that cannot be applied to type "Delivery": Type "Delivery" does not have a field "accesGroup". Did you mean "accessGroup"?',
                'permission-profiles.yaml: Cannot be applied to type "Delivery": Type "Delivery" does not have a field "accesGroup". Did you mean "accessGroup"?',
            ],
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
            [
                'ttl.yaml: Type "Delivery" does not have a field "handlingunits". Did you mean "handlingUnits"?',
            ],
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
            [
                'billing.json: Type "Delivery" does not have a field "procesing". Did you mean "processing"?',
            ],
            'Change to "processing"',
        );
        expect(body).to.equal(billing);
    });

    it('fixes field names in collect paths', () => {
        const collectField = (path: string) =>
            `    processing: ProcessingInfo\n    handlingUnitNumbers: [String] @collect(path: "${path}", aggregate: DISTINCT)\n`;
        const body = applyQuickFix(
            {
                'schema.graphqls': schema.replace(
                    '    processing: ProcessingInfo\n',
                    collectField('handlingUnits.handlingUnitNumbr'),
                ),
                'permission-profiles.yaml': permissionProfiles,
            },
            'schema.graphqls',
            [
                'schema.graphqls: Type "HandlingUnit" does not have a field "handlingUnitNumbr". Did you mean "handlingUnitNumber"?',
            ],
            'Change to "handlingUnitNumber"',
        );
        expect(body).to.equal(
            schema.replace(
                '    processing: ProcessingInfo\n',
                collectField('handlingUnits.handlingUnitNumber'),
            ),
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
            [
                'ttl.yaml: No rootEntity with the name "Delivry" is defined. Did you mean "Delivery"?',
            ],
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
                [
                    'billing.json: No rootEntity with the name "delivery" is defined. Did you mean "Delivery"?',
                ],
                'Change to "Delivery"',
            ),
        ).to.equal(billing);
        expect(
            applyQuickFix(
                { ...sources, 'billing.json': billing.replace('deliveryNumber', 'deliveryNumbr') },
                'billing.json',
                [
                    'billing.json: The field "deliveryNumbr" is not defined in the type "Delivery". Did you mean "deliveryNumber"?',
                ],
                'Change to "deliveryNumber"',
            ),
        ).to.equal(billing);
    });
});
