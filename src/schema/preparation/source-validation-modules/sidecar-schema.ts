import { SourceValidator } from '../ast-validator';
import { ProjectSource, SourceType } from '../../../project/source';
import { MessageLocation, SourcePosition, ValidationMessage } from '../../../model';
import { load } from 'js-yaml';
import { parse, Pointers } from 'json-source-map';
import * as stripJsonComments from 'strip-json-comments';
import ajv = require('ajv');

export class SidecarSchemaValidator implements SourceValidator {
    validate(source: ProjectSource): ValidationMessage[] {
        if (source.type != SourceType.JSON && source.type != SourceType.YAML) {
            return [];
        }

        let pointers: Pointers;
        let data: any;
        try {
            if (source.type == SourceType.JSON) {
                // whitespace: true replaces non-whitespace in comments with spaces so that the sourcemap still matches
                const bodyWithoutComments = stripJsonComments(source.body, { whitespace: true });
                const result = parse(bodyWithoutComments);
                pointers = result.pointers;
                data = result.data;
            } else {
                data = load(source.body);
                pointers = {};
            }
        } catch (e) {
            return [];
        }

        const validate = ajv({
            allErrors: true
        }).compile(schemaJSON);
        if (validate(data) || !validate.errors) {
            return [];
        }

        return validate.errors.map((err): ValidationMessage => {
            const path = reformatPath(err.dataPath);
            if (path in pointers) {
                const pointer = pointers[path];
                const loc = new MessageLocation(source,
                    new SourcePosition(pointer.value.pos, pointer.value.line + 1, pointer.value.column + 1),
                    new SourcePosition(pointer.valueEnd.pos, pointer.valueEnd.line + 1, pointer.valueEnd.column + 1));
                return ValidationMessage.error(err.message!, {}, loc);
            } else {
                return ValidationMessage.error(`${err.message} (at ${err.dataPath}`);
            }
        });
    }
}


function reformatPath(path: string) {
    return path
        .replace(/\.(\w+)/g, (_, name) => `/${name}`)
        .replace(/\[\'([^']*)\'\]/g, (_, name) => `/${name}`)
        .replace(/\[([^\]])*\]/g, (_, name) => `/${name}`);
}

// TODO: JSON Schema should be extracted into separate file
const schemaJSON = JSON.parse(`{
  "$schema": "http://json-schema.org/draft-07/schema#",
  "description": "Sidecar file for schema definitions",
  "type": "object",
  "minProperties": 1,
  "additionalProperties": false,
  "properties": {
    "permissionProfiles": {
      "type": "object",
      "additionalProperties": false,
      "patternProperties": {
        "^[a-zA-Z0-9]+$": {
          "$ref": "#/definitions/PermissionProfile"
        }
      }
    },
    "i18n": {
      "type": "object",
      "additionalProperties": false,
      "patternProperties": {
        "^[a-zA-Z0-9_-]+$": {
          "$ref": "#/definitions/TranslationNamespace"
        }
      }
    }
  },
  "definitions": {
    "PermissionProfile": {
      "type": "object",
      "required": [
        "permissions"
      ],
      "additionalProperties": false,
      "properties": {
        "permissions": {
          "type": "array",
          "minLength": 1,
          "items": {
            "$ref": "#/definitions/Permission"
          }
        }
      }
    },
    "Permission": {
      "type": "object",
      "required": [
        "roles",
        "access"
      ],
      "additionalProperties": false,
      "properties": {
        "roles": {
          "type": "array",
          "minLength": 1,
          "items": {
            "type": "string",
            "pattern": ".+"
          }
        },
        "access": {
          "type": "string",
          "enum": [
            "read",
            "readWrite"
          ]
        },
        "restrictToAccessGroups": {
          "type": "array",
          "minLength": 1,
          "items": {
            "type": "string",
            "pattern": ".+"
          }
        }
      }
    },
    "TranslationNamespace": {
      "type": "object",
      "additionalProperties": false,
      "properties": {
        "types": {
          "patternProperties": {
            "^[a-zA-Z0-9_$]+$": {
              "$ref": "#/definitions/TypeTranslation"
            }
          }
        },
        "fields": {
          "patternProperties": {
            "^[a-zA-Z0-9_$]+$": {
              "anyOf": [
                { "$ref": "#/definitions/FieldTranslation" },
                { "type": "string" }
              ]
            }
          }
        },
        "namespaces": {
          "^[a-zA-Z0-9_$]+$": {
            "anyOf": [
              { "$ref": "#/definitions/FieldTranslation" },
              { "type": "string" }
            ]
          }
        }
      }
    },
    "TypeTranslation": {
      "type": "object",
      "additionalProperties": false,
      "properties": {
        "fields": {
          "patternProperties": {
            "^[a-zA-Z0-9_$]+$": {
              "anyOf": [
                {
                  "$ref": "#/definitions/FieldTranslation"
                },
                {
                  "type": "string"
                }
              ]
            }
          }
        },
        "singular": {
          "type": "string"
        },
        "plural": {
          "type": "string"
        },
        "hint": {
          "type": "string"
        }
      }
    },
    "FieldTranslation": {
      "properties": {
        "label": {
          "type": "string"
        },
        "hint": {
          "type": "string"
        }
      }
    }
  }
}
`);
