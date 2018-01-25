import { ProjectSource } from '../../../src/project/source';
import { SidecarSchemaValidator } from '../../../src/schema/preparation/source-validation-modules/sidecar-schema';

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

    it('reports errors', () => {
        const messages = validator.validate(new ProjectSource('test.json', invalidValue));
        expect(messages.length).toBe(2);
        expect(messages[0].message).toBe("should be equal to one of the allowed values")
        expect(messages[1].message).toBe("should be array");;
        expect(JSON.parse(JSON.stringify(messages[1].location))).toEqual({
            sourceName: 'test.json',
            start: { offset: 352, line: 12, column: 47 },
            end: { offset: 364, line: 12, column: 59 }
        });
    });

    it('accepts valid files', () => {
        const messages = validator.validate(new ProjectSource('file.json', validValue));
        expect(messages).toEqual([]);
    });

    it('reports errors in files with comments', () => {
        const messages = validator.validate(new ProjectSource('test.json', invalidValueWithComments));
        expect(messages.length).toBe(2);
        expect(messages[0].message).toBe("should be equal to one of the allowed values")
        expect(messages[1].message).toBe("should be array");
        expect(JSON.parse(JSON.stringify(messages[1].location))).toEqual({
            sourceName: 'test.json',
            start: { offset: 407, line: 14, column: 47 },
            end: { offset: 419, line: 14, column: 59 }
        });
    });

});
