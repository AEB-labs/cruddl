import { Severity, ValidationContext, ValidationMessage } from '../../../src/model/validation';
import { ProjectSource } from '../../../src/project/source';
import { SidecarSchemaValidator } from '../../../src/schema/preparation/source-validation-modules/sidecar-schema';
import { expect } from 'chai';
import { parseProjectSource } from '../../../src/schema/schema-builder';

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

    function getValidatorMessages(ps: ProjectSource): ValidationMessage[] {
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
        expect(messages[0].message).to.equal('must NOT have additional properties');
        expect(messages[0].severity).to.equal(Severity.Warning);
    });

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
        expect(JSON.parse(JSON.stringify(messages[0].location))).to.deep.equal({
            _end: 56,
            _start: 9,
            sourceName: 'file.yaml',
        });
    });
});
