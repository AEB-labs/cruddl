import { describe, expect, it } from 'vitest';
import { applyChangeSet } from '../../../model/change-set/apply-change-set.js';
import type { ValidationMessage } from '../../../model/validation/message.js';
import { Severity } from '../../../model/validation/message.js';
import { ValidationContext } from '../../../model/validation/validation-context.js';
import { Project } from '../../../project/project.js';
import { ProjectSource } from '../../../project/source.js';
import { parseProjectSource } from '../../parsing/parse-project-source.js';
import { SidecarSchemaValidator } from './sidecar-schema.js';

const validValue = `{
    "permissionProfiles": {
        "restricted": {
            "permissions": [
                {
                    "roles": ["admin"],
                    "access": "readWrite" /* comment */
                },
                {
                    "roles": ["accounting"],
                    "access": "readWrite",
                    "restrictToAccessGroups": [ "accounting" ]
                }
            ]
        }
    }
}`;

const invalidValue = `{
    "permissionProfiles": {
        "restricted": {
            "permissions": [
                {
                    "roles": ["admin"],
                    "access": "invalid"
                },
                {
                    "roles": ["accounting"],
                    "access": "readWrite",
                    "restrictToAccessGroups": "accounting"
                }
            ]
        }
    }
}`;

const invalidValueWithComments = `{
    "permissionProfiles": {
        "restricted": {
            "permissions": [
                {
                    "roles": ["admin"],
                    "access": "invalid"
                },
                /* block
                   comment */
                {
                    "roles": ["accounting"],
                    "access": "readWrite",
                    "restrictToAccessGroups": "accounting"
                }
            ]
        }
    }
}`;

describe('sidecar-schema validator', () => {
    const validator = new SidecarSchemaValidator();

    function getValidatorMessages(ps: ProjectSource): ReadonlyArray<ValidationMessage> {
        const parsedSource = parseProjectSource(ps, {}, new ValidationContext());
        if (parsedSource) {
            return validator.validate(parsedSource);
        }

        expect(parsedSource).to.not.be.undefined;
        throw new Error('Not reachable');
    }

    it('reports errors in json files', () => {
        const messages = getValidatorMessages(new ProjectSource('test.json', invalidValue));
        expect(messages.length).to.equal(4);
        expect(messages[0].message).to.equal('must be equal to one of the allowed values');
        expect(messages[1].message).to.equal('must be array');
        expect(messages[2].message).to.equal('must match exactly one schema in oneOf');
        expect(messages[3].message).to.equal('must be array');
        expect(JSON.parse(JSON.stringify(messages[3].location))).to.deep.equal({
            _end: 364,
            _start: 352,
            sourceName: 'test.json',
        });
    });

    it('accepts valid json files', () => {
        const messages = getValidatorMessages(new ProjectSource('file.json', validValue));
        expect(messages).to.deep.equal([]);
    });

    it('warns about unsupported properties on root level', () => {
        const messages = getValidatorMessages(
            new ProjectSource('file.json', JSON.stringify({ unsupportedRootField: {} })),
        );
        expect(messages.length).to.equal(1);
        expect(messages[0].message).to.equal(
            'Unknown property "unsupportedRootField". It will be ignored.',
        );
        expect(messages[0].severity).to.equal(Severity.WARNING);
    });

    it('warns about unknown properties in restrictions', () => {
        const messages = getValidatorMessages(
            new ProjectSource(
                'file.json',
                JSON.stringify({
                    permissionProfiles: {
                        restricted: {
                            permissions: [
                                {
                                    roles: ['user'],
                                    access: 'readWrite',
                                    restrictions: [{ field: 'owner', value: 'a', optional: true }],
                                },
                            ],
                        },
                    },
                }),
            ),
        );
        expect(messages.length).to.equal(1);
        expect(messages[0].message).to.equal(
            'Unknown property "optional" in permission restriction. This will be an error in a future release.',
        );
        expect(messages[0].severity).to.equal(Severity.WARNING);
    });

    for (const [description, restriction] of [
        ['multiple values', { field: 'owner', value: 'a', valueTemplate: 'b' }],
        ['no value', { field: 'owner' }],
    ] as const) {
        it(`reports restrictions with ${description}`, () => {
            const messages = getValidatorMessages(
                new ProjectSource(
                    'file.json',
                    JSON.stringify({
                        permissionProfiles: {
                            restricted: {
                                permissions: [
                                    {
                                        roles: ['user'],
                                        access: 'readWrite',
                                        restrictions: [restriction],
                                    },
                                ],
                            },
                        },
                    }),
                ),
            );
            expect(messages.map((m) => m.message)).to.deep.equal([
                'Exactly one of "value", "valueTemplate" and "claim" must be specified in a permission restriction.',
            ]);
            expect(messages[0].severity).to.equal(Severity.ERROR);
        });
    }

    it('reports errors in files with comments', () => {
        const messages = getValidatorMessages(
            new ProjectSource('test.json', invalidValueWithComments),
        );
        expect(messages.length).to.equal(4);
        expect(messages[0].message).to.equal('must be equal to one of the allowed values');
        expect(messages[1].message).to.equal('must be array');
        expect(messages[2].message).to.equal('must match exactly one schema in oneOf');
        expect(messages[3].message).to.equal('must be array');
        expect(JSON.parse(JSON.stringify(messages[3].location))).to.deep.equal({
            _end: 419,
            _start: 407,
            sourceName: 'test.json',
        });
    });

    it('accepts valid yaml files', () => {
        const messages = getValidatorMessages(
            new ProjectSource(
                'file.yaml',
                `
i18n:
  de:
    types:
      Temp:
        label: Test`,
            ),
        );
        expect(messages).to.deep.equal([]);
    });

    it('reports errors in yaml files', () => {
        const messages = getValidatorMessages(
            new ProjectSource(
                'file.yaml',
                `
i18n:
  de:
    typess:
      Temp:
        label: Test`,
            ),
        );
        expect(messages.length).to.equal(1);
        expect(messages[0].message).to.equal('Unknown property "typess".');
        expect(JSON.parse(JSON.stringify(messages[0].location))).to.deep.equal({
            _end: 56,
            _start: 17,
            sourceName: 'file.yaml',
        });
    });

    it('reports errors on empty properties in yaml files', () => {
        const messages = getValidatorMessages(
            new ProjectSource(
                'file.yaml',
                `
i18n:
  de:
    types:
      Temp:
        label:`,
            ),
        );
        expect(messages.length).to.equal(1);
        expect(JSON.parse(JSON.stringify(messages[0].location))).to.deep.equal({
            _end: 50,
            _start: 44,
            sourceName: 'file.yaml',
        });
    });

    describe('locales outside of i18n', () => {
        const source = `i18n:
  de:
    types:
      Delivery:
        label: Lieferung

en:
  types:
    Delivery:
      label: Delivery
`;

        it('warns about them', () => {
            const messages = getValidatorMessages(new ProjectSource('i18n.yaml', source));
            expect(messages.map((m) => m.message)).to.deep.equal([
                'Unknown property "en". It will be ignored.',
            ]);
        });

        it('offers to move them into i18n', () => {
            const projectSource = new ProjectSource('i18n.yaml', source);
            const messages = getValidatorMessages(projectSource);
            const project = new Project([projectSource]);
            const quickFix = messages[0].quickFixes.find(
                (q) => q.description === 'Move into "i18n"',
            );
            expect(quickFix).not.to.be.undefined;
            const newProject = applyChangeSet(project, quickFix!.getChangeSet());
            expect(newProject.sources[0].body).to.equal(`i18n:
  de:
    types:
      Delivery:
        label: Lieferung
  en:
    types:
      Delivery:
        label: Delivery
`);
            expect(getValidatorMessages(newProject.sources[0])).to.deep.equal([]);
        });

        it('offers to move them into i18n if they come first', () => {
            const projectSource = new ProjectSource(
                'i18n.yaml',
                `en:
  types:
    Delivery:
      label: Delivery

i18n:
  de:
    types:
      Delivery:
        label: Lieferung
`,
            );
            const messages = getValidatorMessages(projectSource);
            const quickFix = messages[0].quickFixes.find(
                (q) => q.description === 'Move into "i18n"',
            );
            const newProject = applyChangeSet(
                new Project([projectSource]),
                quickFix!.getChangeSet(),
            );
            expect(newProject.sources[0].body).to.equal(`i18n:
  de:
    types:
      Delivery:
        label: Lieferung
  en:
    types:
      Delivery:
        label: Delivery
`);
        });

        it('keeps CRLF line breaks', () => {
            const projectSource = new ProjectSource('i18n.yaml', source.replace(/\n/g, '\r\n'));
            const messages = getValidatorMessages(projectSource);
            const quickFix = messages[0].quickFixes.find(
                (q) => q.description === 'Move into "i18n"',
            );
            const newProject = applyChangeSet(
                new Project([projectSource]),
                quickFix!.getChangeSet(),
            );
            expect(newProject.sources[0].body).to.equal(
                `i18n:
  de:
    types:
      Delivery:
        label: Lieferung
  en:
    types:
      Delivery:
        label: Delivery
`.replace(/\n/g, '\r\n'),
            );
        });

        it('does not offer to move into a flow map', () => {
            const messages = getValidatorMessages(
                new ProjectSource('i18n.yaml', `i18n: {\n  de: {}\n}\nen:\n  types: {}\n`),
            );
            expect(messages[0].quickFixes).to.deep.equal([]);
        });

        it('does not offer to move other properties', () => {
            const messages = getValidatorMessages(
                new ProjectSource('i18n.yaml', `i18n:\n  de: {}\nlabels:\n  foo: bar\n`),
            );
            expect(messages[0].quickFixes).to.deep.equal([]);
        });
    });
});
