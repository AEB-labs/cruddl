import { ValidationContext, ValidationMessage } from '../../../src/model/validation';
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
        const parsedSource = parseProjectSource(ps, new ValidationContext());
        if(parsedSource){
            return validator.validate(parsedSource);
        }

        expect(parsedSource).to.not.be.undefined;
        throw new Error("Not reachable");
    }

    it('reports errors', () => {
        const messages = getValidatorMessages(new ProjectSource('test.json', invalidValue));
        expect(messages.length).to.equal(2);
        expect(messages[0].message).to.equal("should be equal to one of the allowed values");
        expect(messages[1].message).to.equal("should be array");
        expect(JSON.parse(JSON.stringify(messages[1].location))).to.deep.equal({
            "_end": 364,
            "_start": 352,
            "sourceName": "test.json"
        });
    });

    it('accepts valid files', () => {
        const messages = getValidatorMessages(new ProjectSource('file.json', validValue));
        expect(messages).to.deep.equal([]);
    });

    it('reports errors in files with comments', () => {
        const messages = getValidatorMessages(new ProjectSource('test.json', invalidValueWithComments));
        expect(messages.length).to.equal(2);
        expect(messages[0].message).to.equal("should be equal to one of the allowed values");
        expect(messages[1].message).to.equal("should be array");
        expect(JSON.parse(JSON.stringify(messages[1].location))).to.deep.equal({
            "_end": 419,
            "_start": 407,
            "sourceName": "test.json"
        });
    });

});
