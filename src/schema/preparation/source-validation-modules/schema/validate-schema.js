'use strict';
module.exports = validate20;
module.exports.default = validate20;
const schema22 = {
    $schema: 'http://json-schema.org/draft-07/schema#',
    description: 'Sidecar file for schema definitions',
    type: 'object',
    minProperties: 1,
    additionalProperties: false,
    properties: {
        permissionProfiles: {
            type: 'object',
            additionalProperties: false,
            patternProperties: { '^[a-zA-Z0-9]+$': { $ref: '#/definitions/PermissionProfile' } },
        },
        i18n: {
            type: 'object',
            additionalProperties: false,
            patternProperties: {
                '^[a-zA-Z0-9_-]+$': { $ref: '#/definitions/NamespaceLocalization' },
            },
        },
        billing: {
            type: 'object',
            properties: {
                billingEntities: {
                    type: 'array',
                    items: {
                        type: 'object',
                        properties: {
                            typeName: { type: 'string', pattern: '^[a-zA-Z0-9_-]+$' },
                            keyFieldName: { type: 'string', pattern: '^[a-zA-Z0-9_-]+$' },
                            quantityFieldName: { type: 'string' },
                            category: { type: 'string' },
                            categoryMapping: {
                                type: 'object',
                                properties: {
                                    fieldName: { type: 'string' },
                                    defaultValue: { type: 'string', pattern: '^[a-zA-Z0-9_-]+$' },
                                    values: {
                                        type: 'object',
                                        additionalProperties: { type: 'string' },
                                    },
                                },
                                additionalProperties: false,
                                required: ['fieldName', 'defaultValue', 'values'],
                            },
                        },
                        required: ['typeName'],
                        additionalProperties: false,
                    },
                },
            },
            additionalProperties: false,
        },
        timeToLive: {
            type: 'array',
            items: {
                type: 'object',
                properties: {
                    'typeName:': { type: 'string', pattern: '^[a-zA-Z0-9_-]+$' },
                    'dateField:': { type: 'string', pattern: '^([a-zA-Z0-9_-]|\\.)+$' },
                    expireAfterDays: { type: 'integer', minimum: 1 },
                    'cascadeFields:': {
                        type: 'array',
                        items: { type: 'string', pattern: '^([a-zA-Z0-9_-]|\\.)+$' },
                    },
                },
                required: ['typeName', 'dateField', 'expireAfterDays'],
            },
        },
        modules: { type: 'array', items: { type: 'string' } },
    },
    definitions: {
        PermissionProfile: {
            type: 'object',
            additionalProperties: false,
            properties: {
                permissions: { type: 'array', items: { $ref: '#/definitions/Permission' } },
            },
        },
        Permission: {
            type: 'object',
            required: ['roles', 'access'],
            additionalProperties: false,
            properties: {
                roles: { type: 'array', minItems: 1, items: { type: 'string', pattern: '.+' } },
                access: {
                    oneOf: [
                        {
                            type: 'string',
                            enum: ['read', 'readWrite', 'create', 'update', 'delete'],
                        },
                        {
                            type: 'array',
                            items: {
                                type: 'string',
                                enum: ['read', 'readWrite', 'create', 'update', 'delete'],
                            },
                            minItems: 1,
                        },
                    ],
                },
                restrictToAccessGroups: {
                    type: 'array',
                    minItems: 1,
                    items: { type: 'string', pattern: '.+' },
                },
                restrictions: {
                    type: 'array',
                    items: { $ref: '#/definitions/PermissionRestriction' },
                },
            },
        },
        PermissionRestriction: {
            type: 'object',
            required: ['field'],
            properties: { field: { type: 'string' } },
            oneOf: [
                { $ref: '#/definitions/PermissionRestrictionWithValue' },
                { $ref: '#/definitions/PermissionRestrictionWithValueTemplate' },
                { $ref: '#/definitions/PermissionRestrictionWithClaim' },
            ],
        },
        PermissionRestrictionWithValue: {
            type: 'object',
            required: ['value'],
            properties: { value: {} },
        },
        PermissionRestrictionWithValueTemplate: {
            type: 'object',
            required: ['valueTemplate'],
            properties: { valueTemplate: { type: 'string' } },
        },
        PermissionRestrictionWithClaim: {
            type: 'object',
            required: ['claim'],
            properties: { claim: { type: 'string', minLength: 1 } },
        },
        NamespaceLocalization: {
            type: 'object',
            additionalProperties: false,
            properties: {
                types: {
                    type: 'object',
                    patternProperties: {
                        '^[a-zA-Z0-9_]+$': { $ref: '#/definitions/TypeLocalization' },
                    },
                },
                fields: {
                    type: 'object',
                    patternProperties: {
                        '^[a-zA-Z0-9_]+$': {
                            anyOf: [
                                { $ref: '#/definitions/FieldLocalization' },
                                { type: 'string' },
                            ],
                        },
                    },
                },
            },
        },
        TypeLocalization: {
            type: 'object',
            additionalProperties: false,
            properties: {
                fields: {
                    type: 'object',
                    patternProperties: {
                        '^[a-zA-Z0-9_]+$': {
                            anyOf: [
                                { $ref: '#/definitions/FieldLocalization' },
                                { type: 'string' },
                            ],
                        },
                    },
                },
                values: {
                    type: 'object',
                    patternProperties: {
                        '^[a-zA-Z0-9_]+$': {
                            anyOf: [
                                { $ref: '#/definitions/EnumValueLocalization' },
                                { type: 'string' },
                            ],
                        },
                    },
                },
                label: { type: 'string' },
                labelPlural: { type: 'string' },
                hint: { type: 'string' },
            },
        },
        FieldLocalization: {
            type: 'object',
            additionalProperties: false,
            properties: { label: { type: 'string' }, hint: { type: 'string' } },
        },
        EnumValueLocalization: {
            type: 'object',
            additionalProperties: false,
            properties: { label: { type: 'string' }, hint: { type: 'string' } },
        },
    },
};
const pattern0 = new RegExp('^[a-zA-Z0-9]+$', 'u');
const pattern4 = new RegExp('^[a-zA-Z0-9_-]+$', 'u');
const pattern14 = new RegExp('^([a-zA-Z0-9_-]|\\.)+$', 'u');
const schema23 = {
    type: 'object',
    additionalProperties: false,
    properties: { permissions: { type: 'array', items: { $ref: '#/definitions/Permission' } } },
};
const schema24 = {
    type: 'object',
    required: ['roles', 'access'],
    additionalProperties: false,
    properties: {
        roles: { type: 'array', minItems: 1, items: { type: 'string', pattern: '.+' } },
        access: {
            oneOf: [
                { type: 'string', enum: ['read', 'readWrite', 'create', 'update', 'delete'] },
                {
                    type: 'array',
                    items: {
                        type: 'string',
                        enum: ['read', 'readWrite', 'create', 'update', 'delete'],
                    },
                    minItems: 1,
                },
            ],
        },
        restrictToAccessGroups: {
            type: 'array',
            minItems: 1,
            items: { type: 'string', pattern: '.+' },
        },
        restrictions: { type: 'array', items: { $ref: '#/definitions/PermissionRestriction' } },
    },
};
const pattern2 = new RegExp('.+', 'u');
const schema25 = {
    type: 'object',
    required: ['field'],
    properties: { field: { type: 'string' } },
    oneOf: [
        { $ref: '#/definitions/PermissionRestrictionWithValue' },
        { $ref: '#/definitions/PermissionRestrictionWithValueTemplate' },
        { $ref: '#/definitions/PermissionRestrictionWithClaim' },
    ],
};
const schema26 = { type: 'object', required: ['value'], properties: { value: {} } };
const schema27 = {
    type: 'object',
    required: ['valueTemplate'],
    properties: { valueTemplate: { type: 'string' } },
};
const schema28 = {
    type: 'object',
    required: ['claim'],
    properties: { claim: { type: 'string', minLength: 1 } },
};
const func4 = require('ajv/dist/runtime/ucs2length').default;
function validate23(
    data,
    { instancePath = '', parentData, parentDataProperty, rootData = data } = {},
) {
    let vErrors = null;
    let errors = 0;
    const _errs1 = errors;
    let valid0 = false;
    let passing0 = null;
    const _errs2 = errors;
    if (data && typeof data == 'object' && !Array.isArray(data)) {
        if (data.value === undefined) {
            const err0 = {
                instancePath,
                schemaPath: '#/definitions/PermissionRestrictionWithValue/required',
                keyword: 'required',
                params: { missingProperty: 'value' },
                message: "must have required property '" + 'value' + "'",
            };
            if (vErrors === null) {
                vErrors = [err0];
            } else {
                vErrors.push(err0);
            }
            errors++;
        }
    } else {
        const err1 = {
            instancePath,
            schemaPath: '#/definitions/PermissionRestrictionWithValue/type',
            keyword: 'type',
            params: { type: 'object' },
            message: 'must be object',
        };
        if (vErrors === null) {
            vErrors = [err1];
        } else {
            vErrors.push(err1);
        }
        errors++;
    }
    var _valid0 = _errs2 === errors;
    if (_valid0) {
        valid0 = true;
        passing0 = 0;
    }
    const _errs5 = errors;
    if (data && typeof data == 'object' && !Array.isArray(data)) {
        if (data.valueTemplate === undefined) {
            const err2 = {
                instancePath,
                schemaPath: '#/definitions/PermissionRestrictionWithValueTemplate/required',
                keyword: 'required',
                params: { missingProperty: 'valueTemplate' },
                message: "must have required property '" + 'valueTemplate' + "'",
            };
            if (vErrors === null) {
                vErrors = [err2];
            } else {
                vErrors.push(err2);
            }
            errors++;
        }
        if (data.valueTemplate !== undefined) {
            if (typeof data.valueTemplate !== 'string') {
                const err3 = {
                    instancePath: instancePath + '/valueTemplate',
                    schemaPath:
                        '#/definitions/PermissionRestrictionWithValueTemplate/properties/valueTemplate/type',
                    keyword: 'type',
                    params: { type: 'string' },
                    message: 'must be string',
                };
                if (vErrors === null) {
                    vErrors = [err3];
                } else {
                    vErrors.push(err3);
                }
                errors++;
            }
        }
    } else {
        const err4 = {
            instancePath,
            schemaPath: '#/definitions/PermissionRestrictionWithValueTemplate/type',
            keyword: 'type',
            params: { type: 'object' },
            message: 'must be object',
        };
        if (vErrors === null) {
            vErrors = [err4];
        } else {
            vErrors.push(err4);
        }
        errors++;
    }
    var _valid0 = _errs5 === errors;
    if (_valid0 && valid0) {
        valid0 = false;
        passing0 = [passing0, 1];
    } else {
        if (_valid0) {
            valid0 = true;
            passing0 = 1;
        }
        const _errs10 = errors;
        if (data && typeof data == 'object' && !Array.isArray(data)) {
            if (data.claim === undefined) {
                const err5 = {
                    instancePath,
                    schemaPath: '#/definitions/PermissionRestrictionWithClaim/required',
                    keyword: 'required',
                    params: { missingProperty: 'claim' },
                    message: "must have required property '" + 'claim' + "'",
                };
                if (vErrors === null) {
                    vErrors = [err5];
                } else {
                    vErrors.push(err5);
                }
                errors++;
            }
            if (data.claim !== undefined) {
                let data1 = data.claim;
                if (typeof data1 === 'string') {
                    if (func4(data1) < 1) {
                        const err6 = {
                            instancePath: instancePath + '/claim',
                            schemaPath:
                                '#/definitions/PermissionRestrictionWithClaim/properties/claim/minLength',
                            keyword: 'minLength',
                            params: { limit: 1 },
                            message: 'must NOT have fewer than 1 characters',
                        };
                        if (vErrors === null) {
                            vErrors = [err6];
                        } else {
                            vErrors.push(err6);
                        }
                        errors++;
                    }
                } else {
                    const err7 = {
                        instancePath: instancePath + '/claim',
                        schemaPath:
                            '#/definitions/PermissionRestrictionWithClaim/properties/claim/type',
                        keyword: 'type',
                        params: { type: 'string' },
                        message: 'must be string',
                    };
                    if (vErrors === null) {
                        vErrors = [err7];
                    } else {
                        vErrors.push(err7);
                    }
                    errors++;
                }
            }
        } else {
            const err8 = {
                instancePath,
                schemaPath: '#/definitions/PermissionRestrictionWithClaim/type',
                keyword: 'type',
                params: { type: 'object' },
                message: 'must be object',
            };
            if (vErrors === null) {
                vErrors = [err8];
            } else {
                vErrors.push(err8);
            }
            errors++;
        }
        var _valid0 = _errs10 === errors;
        if (_valid0 && valid0) {
            valid0 = false;
            passing0 = [passing0, 2];
        } else {
            if (_valid0) {
                valid0 = true;
                passing0 = 2;
            }
        }
    }
    if (!valid0) {
        const err9 = {
            instancePath,
            schemaPath: '#/oneOf',
            keyword: 'oneOf',
            params: { passingSchemas: passing0 },
            message: 'must match exactly one schema in oneOf',
        };
        if (vErrors === null) {
            vErrors = [err9];
        } else {
            vErrors.push(err9);
        }
        errors++;
    } else {
        errors = _errs1;
        if (vErrors !== null) {
            if (_errs1) {
                vErrors.length = _errs1;
            } else {
                vErrors = null;
            }
        }
    }
    if (data && typeof data == 'object' && !Array.isArray(data)) {
        if (data.field === undefined) {
            const err10 = {
                instancePath,
                schemaPath: '#/required',
                keyword: 'required',
                params: { missingProperty: 'field' },
                message: "must have required property '" + 'field' + "'",
            };
            if (vErrors === null) {
                vErrors = [err10];
            } else {
                vErrors.push(err10);
            }
            errors++;
        }
        if (data.field !== undefined) {
            if (typeof data.field !== 'string') {
                const err11 = {
                    instancePath: instancePath + '/field',
                    schemaPath: '#/properties/field/type',
                    keyword: 'type',
                    params: { type: 'string' },
                    message: 'must be string',
                };
                if (vErrors === null) {
                    vErrors = [err11];
                } else {
                    vErrors.push(err11);
                }
                errors++;
            }
        }
    } else {
        const err12 = {
            instancePath,
            schemaPath: '#/type',
            keyword: 'type',
            params: { type: 'object' },
            message: 'must be object',
        };
        if (vErrors === null) {
            vErrors = [err12];
        } else {
            vErrors.push(err12);
        }
        errors++;
    }
    validate23.errors = vErrors;
    return errors === 0;
}
function validate22(
    data,
    { instancePath = '', parentData, parentDataProperty, rootData = data } = {},
) {
    let vErrors = null;
    let errors = 0;
    if (data && typeof data == 'object' && !Array.isArray(data)) {
        if (data.roles === undefined) {
            const err0 = {
                instancePath,
                schemaPath: '#/required',
                keyword: 'required',
                params: { missingProperty: 'roles' },
                message: "must have required property '" + 'roles' + "'",
            };
            if (vErrors === null) {
                vErrors = [err0];
            } else {
                vErrors.push(err0);
            }
            errors++;
        }
        if (data.access === undefined) {
            const err1 = {
                instancePath,
                schemaPath: '#/required',
                keyword: 'required',
                params: { missingProperty: 'access' },
                message: "must have required property '" + 'access' + "'",
            };
            if (vErrors === null) {
                vErrors = [err1];
            } else {
                vErrors.push(err1);
            }
            errors++;
        }
        for (const key0 in data) {
            if (
                !(
                    key0 === 'roles' ||
                    key0 === 'access' ||
                    key0 === 'restrictToAccessGroups' ||
                    key0 === 'restrictions'
                )
            ) {
                const err2 = {
                    instancePath,
                    schemaPath: '#/additionalProperties',
                    keyword: 'additionalProperties',
                    params: { additionalProperty: key0 },
                    message: 'must NOT have additional properties',
                };
                if (vErrors === null) {
                    vErrors = [err2];
                } else {
                    vErrors.push(err2);
                }
                errors++;
            }
        }
        if (data.roles !== undefined) {
            let data0 = data.roles;
            if (Array.isArray(data0)) {
                if (data0.length < 1) {
                    const err3 = {
                        instancePath: instancePath + '/roles',
                        schemaPath: '#/properties/roles/minItems',
                        keyword: 'minItems',
                        params: { limit: 1 },
                        message: 'must NOT have fewer than 1 items',
                    };
                    if (vErrors === null) {
                        vErrors = [err3];
                    } else {
                        vErrors.push(err3);
                    }
                    errors++;
                }
                const len0 = data0.length;
                for (let i0 = 0; i0 < len0; i0++) {
                    let data1 = data0[i0];
                    if (typeof data1 === 'string') {
                        if (!pattern2.test(data1)) {
                            const err4 = {
                                instancePath: instancePath + '/roles/' + i0,
                                schemaPath: '#/properties/roles/items/pattern',
                                keyword: 'pattern',
                                params: { pattern: '.+' },
                                message: 'must match pattern "' + '.+' + '"',
                            };
                            if (vErrors === null) {
                                vErrors = [err4];
                            } else {
                                vErrors.push(err4);
                            }
                            errors++;
                        }
                    } else {
                        const err5 = {
                            instancePath: instancePath + '/roles/' + i0,
                            schemaPath: '#/properties/roles/items/type',
                            keyword: 'type',
                            params: { type: 'string' },
                            message: 'must be string',
                        };
                        if (vErrors === null) {
                            vErrors = [err5];
                        } else {
                            vErrors.push(err5);
                        }
                        errors++;
                    }
                }
            } else {
                const err6 = {
                    instancePath: instancePath + '/roles',
                    schemaPath: '#/properties/roles/type',
                    keyword: 'type',
                    params: { type: 'array' },
                    message: 'must be array',
                };
                if (vErrors === null) {
                    vErrors = [err6];
                } else {
                    vErrors.push(err6);
                }
                errors++;
            }
        }
        if (data.access !== undefined) {
            let data2 = data.access;
            const _errs7 = errors;
            let valid3 = false;
            let passing0 = null;
            const _errs8 = errors;
            if (typeof data2 !== 'string') {
                const err7 = {
                    instancePath: instancePath + '/access',
                    schemaPath: '#/properties/access/oneOf/0/type',
                    keyword: 'type',
                    params: { type: 'string' },
                    message: 'must be string',
                };
                if (vErrors === null) {
                    vErrors = [err7];
                } else {
                    vErrors.push(err7);
                }
                errors++;
            }
            if (
                !(
                    data2 === 'read' ||
                    data2 === 'readWrite' ||
                    data2 === 'create' ||
                    data2 === 'update' ||
                    data2 === 'delete'
                )
            ) {
                const err8 = {
                    instancePath: instancePath + '/access',
                    schemaPath: '#/properties/access/oneOf/0/enum',
                    keyword: 'enum',
                    params: { allowedValues: schema24.properties.access.oneOf[0].enum },
                    message: 'must be equal to one of the allowed values',
                };
                if (vErrors === null) {
                    vErrors = [err8];
                } else {
                    vErrors.push(err8);
                }
                errors++;
            }
            var _valid0 = _errs8 === errors;
            if (_valid0) {
                valid3 = true;
                passing0 = 0;
            }
            const _errs10 = errors;
            if (Array.isArray(data2)) {
                if (data2.length < 1) {
                    const err9 = {
                        instancePath: instancePath + '/access',
                        schemaPath: '#/properties/access/oneOf/1/minItems',
                        keyword: 'minItems',
                        params: { limit: 1 },
                        message: 'must NOT have fewer than 1 items',
                    };
                    if (vErrors === null) {
                        vErrors = [err9];
                    } else {
                        vErrors.push(err9);
                    }
                    errors++;
                }
                const len1 = data2.length;
                for (let i1 = 0; i1 < len1; i1++) {
                    let data3 = data2[i1];
                    if (typeof data3 !== 'string') {
                        const err10 = {
                            instancePath: instancePath + '/access/' + i1,
                            schemaPath: '#/properties/access/oneOf/1/items/type',
                            keyword: 'type',
                            params: { type: 'string' },
                            message: 'must be string',
                        };
                        if (vErrors === null) {
                            vErrors = [err10];
                        } else {
                            vErrors.push(err10);
                        }
                        errors++;
                    }
                    if (
                        !(
                            data3 === 'read' ||
                            data3 === 'readWrite' ||
                            data3 === 'create' ||
                            data3 === 'update' ||
                            data3 === 'delete'
                        )
                    ) {
                        const err11 = {
                            instancePath: instancePath + '/access/' + i1,
                            schemaPath: '#/properties/access/oneOf/1/items/enum',
                            keyword: 'enum',
                            params: {
                                allowedValues: schema24.properties.access.oneOf[1].items.enum,
                            },
                            message: 'must be equal to one of the allowed values',
                        };
                        if (vErrors === null) {
                            vErrors = [err11];
                        } else {
                            vErrors.push(err11);
                        }
                        errors++;
                    }
                }
            } else {
                const err12 = {
                    instancePath: instancePath + '/access',
                    schemaPath: '#/properties/access/oneOf/1/type',
                    keyword: 'type',
                    params: { type: 'array' },
                    message: 'must be array',
                };
                if (vErrors === null) {
                    vErrors = [err12];
                } else {
                    vErrors.push(err12);
                }
                errors++;
            }
            var _valid0 = _errs10 === errors;
            if (_valid0 && valid3) {
                valid3 = false;
                passing0 = [passing0, 1];
            } else {
                if (_valid0) {
                    valid3 = true;
                    passing0 = 1;
                }
            }
            if (!valid3) {
                const err13 = {
                    instancePath: instancePath + '/access',
                    schemaPath: '#/properties/access/oneOf',
                    keyword: 'oneOf',
                    params: { passingSchemas: passing0 },
                    message: 'must match exactly one schema in oneOf',
                };
                if (vErrors === null) {
                    vErrors = [err13];
                } else {
                    vErrors.push(err13);
                }
                errors++;
            } else {
                errors = _errs7;
                if (vErrors !== null) {
                    if (_errs7) {
                        vErrors.length = _errs7;
                    } else {
                        vErrors = null;
                    }
                }
            }
        }
        if (data.restrictToAccessGroups !== undefined) {
            let data4 = data.restrictToAccessGroups;
            if (Array.isArray(data4)) {
                if (data4.length < 1) {
                    const err14 = {
                        instancePath: instancePath + '/restrictToAccessGroups',
                        schemaPath: '#/properties/restrictToAccessGroups/minItems',
                        keyword: 'minItems',
                        params: { limit: 1 },
                        message: 'must NOT have fewer than 1 items',
                    };
                    if (vErrors === null) {
                        vErrors = [err14];
                    } else {
                        vErrors.push(err14);
                    }
                    errors++;
                }
                const len2 = data4.length;
                for (let i2 = 0; i2 < len2; i2++) {
                    let data5 = data4[i2];
                    if (typeof data5 === 'string') {
                        if (!pattern2.test(data5)) {
                            const err15 = {
                                instancePath: instancePath + '/restrictToAccessGroups/' + i2,
                                schemaPath: '#/properties/restrictToAccessGroups/items/pattern',
                                keyword: 'pattern',
                                params: { pattern: '.+' },
                                message: 'must match pattern "' + '.+' + '"',
                            };
                            if (vErrors === null) {
                                vErrors = [err15];
                            } else {
                                vErrors.push(err15);
                            }
                            errors++;
                        }
                    } else {
                        const err16 = {
                            instancePath: instancePath + '/restrictToAccessGroups/' + i2,
                            schemaPath: '#/properties/restrictToAccessGroups/items/type',
                            keyword: 'type',
                            params: { type: 'string' },
                            message: 'must be string',
                        };
                        if (vErrors === null) {
                            vErrors = [err16];
                        } else {
                            vErrors.push(err16);
                        }
                        errors++;
                    }
                }
            } else {
                const err17 = {
                    instancePath: instancePath + '/restrictToAccessGroups',
                    schemaPath: '#/properties/restrictToAccessGroups/type',
                    keyword: 'type',
                    params: { type: 'array' },
                    message: 'must be array',
                };
                if (vErrors === null) {
                    vErrors = [err17];
                } else {
                    vErrors.push(err17);
                }
                errors++;
            }
        }
        if (data.restrictions !== undefined) {
            let data6 = data.restrictions;
            if (Array.isArray(data6)) {
                const len3 = data6.length;
                for (let i3 = 0; i3 < len3; i3++) {
                    if (
                        !validate23(data6[i3], {
                            instancePath: instancePath + '/restrictions/' + i3,
                            parentData: data6,
                            parentDataProperty: i3,
                            rootData,
                        })
                    ) {
                        vErrors =
                            vErrors === null
                                ? validate23.errors
                                : vErrors.concat(validate23.errors);
                        errors = vErrors.length;
                    }
                }
            } else {
                const err18 = {
                    instancePath: instancePath + '/restrictions',
                    schemaPath: '#/properties/restrictions/type',
                    keyword: 'type',
                    params: { type: 'array' },
                    message: 'must be array',
                };
                if (vErrors === null) {
                    vErrors = [err18];
                } else {
                    vErrors.push(err18);
                }
                errors++;
            }
        }
    } else {
        const err19 = {
            instancePath,
            schemaPath: '#/type',
            keyword: 'type',
            params: { type: 'object' },
            message: 'must be object',
        };
        if (vErrors === null) {
            vErrors = [err19];
        } else {
            vErrors.push(err19);
        }
        errors++;
    }
    validate22.errors = vErrors;
    return errors === 0;
}
function validate21(
    data,
    { instancePath = '', parentData, parentDataProperty, rootData = data } = {},
) {
    let vErrors = null;
    let errors = 0;
    if (data && typeof data == 'object' && !Array.isArray(data)) {
        for (const key0 in data) {
            if (!(key0 === 'permissions')) {
                const err0 = {
                    instancePath,
                    schemaPath: '#/additionalProperties',
                    keyword: 'additionalProperties',
                    params: { additionalProperty: key0 },
                    message: 'must NOT have additional properties',
                };
                if (vErrors === null) {
                    vErrors = [err0];
                } else {
                    vErrors.push(err0);
                }
                errors++;
            }
        }
        if (data.permissions !== undefined) {
            let data0 = data.permissions;
            if (Array.isArray(data0)) {
                const len0 = data0.length;
                for (let i0 = 0; i0 < len0; i0++) {
                    if (
                        !validate22(data0[i0], {
                            instancePath: instancePath + '/permissions/' + i0,
                            parentData: data0,
                            parentDataProperty: i0,
                            rootData,
                        })
                    ) {
                        vErrors =
                            vErrors === null
                                ? validate22.errors
                                : vErrors.concat(validate22.errors);
                        errors = vErrors.length;
                    }
                }
            } else {
                const err1 = {
                    instancePath: instancePath + '/permissions',
                    schemaPath: '#/properties/permissions/type',
                    keyword: 'type',
                    params: { type: 'array' },
                    message: 'must be array',
                };
                if (vErrors === null) {
                    vErrors = [err1];
                } else {
                    vErrors.push(err1);
                }
                errors++;
            }
        }
    } else {
        const err2 = {
            instancePath,
            schemaPath: '#/type',
            keyword: 'type',
            params: { type: 'object' },
            message: 'must be object',
        };
        if (vErrors === null) {
            vErrors = [err2];
        } else {
            vErrors.push(err2);
        }
        errors++;
    }
    validate21.errors = vErrors;
    return errors === 0;
}
const schema29 = {
    type: 'object',
    additionalProperties: false,
    properties: {
        types: {
            type: 'object',
            patternProperties: { '^[a-zA-Z0-9_]+$': { $ref: '#/definitions/TypeLocalization' } },
        },
        fields: {
            type: 'object',
            patternProperties: {
                '^[a-zA-Z0-9_]+$': {
                    anyOf: [{ $ref: '#/definitions/FieldLocalization' }, { type: 'string' }],
                },
            },
        },
    },
};
const schema31 = {
    type: 'object',
    additionalProperties: false,
    properties: { label: { type: 'string' }, hint: { type: 'string' } },
};
const pattern6 = new RegExp('^[a-zA-Z0-9_]+$', 'u');
const schema30 = {
    type: 'object',
    additionalProperties: false,
    properties: {
        fields: {
            type: 'object',
            patternProperties: {
                '^[a-zA-Z0-9_]+$': {
                    anyOf: [{ $ref: '#/definitions/FieldLocalization' }, { type: 'string' }],
                },
            },
        },
        values: {
            type: 'object',
            patternProperties: {
                '^[a-zA-Z0-9_]+$': {
                    anyOf: [{ $ref: '#/definitions/EnumValueLocalization' }, { type: 'string' }],
                },
            },
        },
        label: { type: 'string' },
        labelPlural: { type: 'string' },
        hint: { type: 'string' },
    },
};
const schema32 = {
    type: 'object',
    additionalProperties: false,
    properties: { label: { type: 'string' }, hint: { type: 'string' } },
};
function validate28(
    data,
    { instancePath = '', parentData, parentDataProperty, rootData = data } = {},
) {
    let vErrors = null;
    let errors = 0;
    if (data && typeof data == 'object' && !Array.isArray(data)) {
        for (const key0 in data) {
            if (
                !(
                    key0 === 'fields' ||
                    key0 === 'values' ||
                    key0 === 'label' ||
                    key0 === 'labelPlural' ||
                    key0 === 'hint'
                )
            ) {
                const err0 = {
                    instancePath,
                    schemaPath: '#/additionalProperties',
                    keyword: 'additionalProperties',
                    params: { additionalProperty: key0 },
                    message: 'must NOT have additional properties',
                };
                if (vErrors === null) {
                    vErrors = [err0];
                } else {
                    vErrors.push(err0);
                }
                errors++;
            }
        }
        if (data.fields !== undefined) {
            let data0 = data.fields;
            if (data0 && typeof data0 == 'object' && !Array.isArray(data0)) {
                for (const key1 in data0) {
                    if (pattern6.test(key1)) {
                        let data1 = data0[key1];
                        const _errs5 = errors;
                        let valid2 = false;
                        const _errs6 = errors;
                        if (data1 && typeof data1 == 'object' && !Array.isArray(data1)) {
                            for (const key2 in data1) {
                                if (!(key2 === 'label' || key2 === 'hint')) {
                                    const err1 = {
                                        instancePath:
                                            instancePath +
                                            '/fields/' +
                                            key1.replace(/~/g, '~0').replace(/\//g, '~1'),
                                        schemaPath:
                                            '#/definitions/FieldLocalization/additionalProperties',
                                        keyword: 'additionalProperties',
                                        params: { additionalProperty: key2 },
                                        message: 'must NOT have additional properties',
                                    };
                                    if (vErrors === null) {
                                        vErrors = [err1];
                                    } else {
                                        vErrors.push(err1);
                                    }
                                    errors++;
                                }
                            }
                            if (data1.label !== undefined) {
                                if (typeof data1.label !== 'string') {
                                    const err2 = {
                                        instancePath:
                                            instancePath +
                                            '/fields/' +
                                            key1.replace(/~/g, '~0').replace(/\//g, '~1') +
                                            '/label',
                                        schemaPath:
                                            '#/definitions/FieldLocalization/properties/label/type',
                                        keyword: 'type',
                                        params: { type: 'string' },
                                        message: 'must be string',
                                    };
                                    if (vErrors === null) {
                                        vErrors = [err2];
                                    } else {
                                        vErrors.push(err2);
                                    }
                                    errors++;
                                }
                            }
                            if (data1.hint !== undefined) {
                                if (typeof data1.hint !== 'string') {
                                    const err3 = {
                                        instancePath:
                                            instancePath +
                                            '/fields/' +
                                            key1.replace(/~/g, '~0').replace(/\//g, '~1') +
                                            '/hint',
                                        schemaPath:
                                            '#/definitions/FieldLocalization/properties/hint/type',
                                        keyword: 'type',
                                        params: { type: 'string' },
                                        message: 'must be string',
                                    };
                                    if (vErrors === null) {
                                        vErrors = [err3];
                                    } else {
                                        vErrors.push(err3);
                                    }
                                    errors++;
                                }
                            }
                        } else {
                            const err4 = {
                                instancePath:
                                    instancePath +
                                    '/fields/' +
                                    key1.replace(/~/g, '~0').replace(/\//g, '~1'),
                                schemaPath: '#/definitions/FieldLocalization/type',
                                keyword: 'type',
                                params: { type: 'object' },
                                message: 'must be object',
                            };
                            if (vErrors === null) {
                                vErrors = [err4];
                            } else {
                                vErrors.push(err4);
                            }
                            errors++;
                        }
                        var _valid0 = _errs6 === errors;
                        valid2 = valid2 || _valid0;
                        if (!valid2) {
                            const _errs14 = errors;
                            if (typeof data1 !== 'string') {
                                const err5 = {
                                    instancePath:
                                        instancePath +
                                        '/fields/' +
                                        key1.replace(/~/g, '~0').replace(/\//g, '~1'),
                                    schemaPath:
                                        '#/properties/fields/patternProperties/%5E%5Ba-zA-Z0-9_%5D%2B%24/anyOf/1/type',
                                    keyword: 'type',
                                    params: { type: 'string' },
                                    message: 'must be string',
                                };
                                if (vErrors === null) {
                                    vErrors = [err5];
                                } else {
                                    vErrors.push(err5);
                                }
                                errors++;
                            }
                            var _valid0 = _errs14 === errors;
                            valid2 = valid2 || _valid0;
                        }
                        if (!valid2) {
                            const err6 = {
                                instancePath:
                                    instancePath +
                                    '/fields/' +
                                    key1.replace(/~/g, '~0').replace(/\//g, '~1'),
                                schemaPath:
                                    '#/properties/fields/patternProperties/%5E%5Ba-zA-Z0-9_%5D%2B%24/anyOf',
                                keyword: 'anyOf',
                                params: {},
                                message: 'must match a schema in anyOf',
                            };
                            if (vErrors === null) {
                                vErrors = [err6];
                            } else {
                                vErrors.push(err6);
                            }
                            errors++;
                        } else {
                            errors = _errs5;
                            if (vErrors !== null) {
                                if (_errs5) {
                                    vErrors.length = _errs5;
                                } else {
                                    vErrors = null;
                                }
                            }
                        }
                    }
                }
            } else {
                const err7 = {
                    instancePath: instancePath + '/fields',
                    schemaPath: '#/properties/fields/type',
                    keyword: 'type',
                    params: { type: 'object' },
                    message: 'must be object',
                };
                if (vErrors === null) {
                    vErrors = [err7];
                } else {
                    vErrors.push(err7);
                }
                errors++;
            }
        }
        if (data.values !== undefined) {
            let data4 = data.values;
            if (data4 && typeof data4 == 'object' && !Array.isArray(data4)) {
                for (const key3 in data4) {
                    if (pattern6.test(key3)) {
                        let data5 = data4[key3];
                        const _errs19 = errors;
                        let valid6 = false;
                        const _errs20 = errors;
                        if (data5 && typeof data5 == 'object' && !Array.isArray(data5)) {
                            for (const key4 in data5) {
                                if (!(key4 === 'label' || key4 === 'hint')) {
                                    const err8 = {
                                        instancePath:
                                            instancePath +
                                            '/values/' +
                                            key3.replace(/~/g, '~0').replace(/\//g, '~1'),
                                        schemaPath:
                                            '#/definitions/EnumValueLocalization/additionalProperties',
                                        keyword: 'additionalProperties',
                                        params: { additionalProperty: key4 },
                                        message: 'must NOT have additional properties',
                                    };
                                    if (vErrors === null) {
                                        vErrors = [err8];
                                    } else {
                                        vErrors.push(err8);
                                    }
                                    errors++;
                                }
                            }
                            if (data5.label !== undefined) {
                                if (typeof data5.label !== 'string') {
                                    const err9 = {
                                        instancePath:
                                            instancePath +
                                            '/values/' +
                                            key3.replace(/~/g, '~0').replace(/\//g, '~1') +
                                            '/label',
                                        schemaPath:
                                            '#/definitions/EnumValueLocalization/properties/label/type',
                                        keyword: 'type',
                                        params: { type: 'string' },
                                        message: 'must be string',
                                    };
                                    if (vErrors === null) {
                                        vErrors = [err9];
                                    } else {
                                        vErrors.push(err9);
                                    }
                                    errors++;
                                }
                            }
                            if (data5.hint !== undefined) {
                                if (typeof data5.hint !== 'string') {
                                    const err10 = {
                                        instancePath:
                                            instancePath +
                                            '/values/' +
                                            key3.replace(/~/g, '~0').replace(/\//g, '~1') +
                                            '/hint',
                                        schemaPath:
                                            '#/definitions/EnumValueLocalization/properties/hint/type',
                                        keyword: 'type',
                                        params: { type: 'string' },
                                        message: 'must be string',
                                    };
                                    if (vErrors === null) {
                                        vErrors = [err10];
                                    } else {
                                        vErrors.push(err10);
                                    }
                                    errors++;
                                }
                            }
                        } else {
                            const err11 = {
                                instancePath:
                                    instancePath +
                                    '/values/' +
                                    key3.replace(/~/g, '~0').replace(/\//g, '~1'),
                                schemaPath: '#/definitions/EnumValueLocalization/type',
                                keyword: 'type',
                                params: { type: 'object' },
                                message: 'must be object',
                            };
                            if (vErrors === null) {
                                vErrors = [err11];
                            } else {
                                vErrors.push(err11);
                            }
                            errors++;
                        }
                        var _valid1 = _errs20 === errors;
                        valid6 = valid6 || _valid1;
                        if (!valid6) {
                            const _errs28 = errors;
                            if (typeof data5 !== 'string') {
                                const err12 = {
                                    instancePath:
                                        instancePath +
                                        '/values/' +
                                        key3.replace(/~/g, '~0').replace(/\//g, '~1'),
                                    schemaPath:
                                        '#/properties/values/patternProperties/%5E%5Ba-zA-Z0-9_%5D%2B%24/anyOf/1/type',
                                    keyword: 'type',
                                    params: { type: 'string' },
                                    message: 'must be string',
                                };
                                if (vErrors === null) {
                                    vErrors = [err12];
                                } else {
                                    vErrors.push(err12);
                                }
                                errors++;
                            }
                            var _valid1 = _errs28 === errors;
                            valid6 = valid6 || _valid1;
                        }
                        if (!valid6) {
                            const err13 = {
                                instancePath:
                                    instancePath +
                                    '/values/' +
                                    key3.replace(/~/g, '~0').replace(/\//g, '~1'),
                                schemaPath:
                                    '#/properties/values/patternProperties/%5E%5Ba-zA-Z0-9_%5D%2B%24/anyOf',
                                keyword: 'anyOf',
                                params: {},
                                message: 'must match a schema in anyOf',
                            };
                            if (vErrors === null) {
                                vErrors = [err13];
                            } else {
                                vErrors.push(err13);
                            }
                            errors++;
                        } else {
                            errors = _errs19;
                            if (vErrors !== null) {
                                if (_errs19) {
                                    vErrors.length = _errs19;
                                } else {
                                    vErrors = null;
                                }
                            }
                        }
                    }
                }
            } else {
                const err14 = {
                    instancePath: instancePath + '/values',
                    schemaPath: '#/properties/values/type',
                    keyword: 'type',
                    params: { type: 'object' },
                    message: 'must be object',
                };
                if (vErrors === null) {
                    vErrors = [err14];
                } else {
                    vErrors.push(err14);
                }
                errors++;
            }
        }
        if (data.label !== undefined) {
            if (typeof data.label !== 'string') {
                const err15 = {
                    instancePath: instancePath + '/label',
                    schemaPath: '#/properties/label/type',
                    keyword: 'type',
                    params: { type: 'string' },
                    message: 'must be string',
                };
                if (vErrors === null) {
                    vErrors = [err15];
                } else {
                    vErrors.push(err15);
                }
                errors++;
            }
        }
        if (data.labelPlural !== undefined) {
            if (typeof data.labelPlural !== 'string') {
                const err16 = {
                    instancePath: instancePath + '/labelPlural',
                    schemaPath: '#/properties/labelPlural/type',
                    keyword: 'type',
                    params: { type: 'string' },
                    message: 'must be string',
                };
                if (vErrors === null) {
                    vErrors = [err16];
                } else {
                    vErrors.push(err16);
                }
                errors++;
            }
        }
        if (data.hint !== undefined) {
            if (typeof data.hint !== 'string') {
                const err17 = {
                    instancePath: instancePath + '/hint',
                    schemaPath: '#/properties/hint/type',
                    keyword: 'type',
                    params: { type: 'string' },
                    message: 'must be string',
                };
                if (vErrors === null) {
                    vErrors = [err17];
                } else {
                    vErrors.push(err17);
                }
                errors++;
            }
        }
    } else {
        const err18 = {
            instancePath,
            schemaPath: '#/type',
            keyword: 'type',
            params: { type: 'object' },
            message: 'must be object',
        };
        if (vErrors === null) {
            vErrors = [err18];
        } else {
            vErrors.push(err18);
        }
        errors++;
    }
    validate28.errors = vErrors;
    return errors === 0;
}
function validate27(
    data,
    { instancePath = '', parentData, parentDataProperty, rootData = data } = {},
) {
    let vErrors = null;
    let errors = 0;
    if (data && typeof data == 'object' && !Array.isArray(data)) {
        for (const key0 in data) {
            if (!(key0 === 'types' || key0 === 'fields')) {
                const err0 = {
                    instancePath,
                    schemaPath: '#/additionalProperties',
                    keyword: 'additionalProperties',
                    params: { additionalProperty: key0 },
                    message: 'must NOT have additional properties',
                };
                if (vErrors === null) {
                    vErrors = [err0];
                } else {
                    vErrors.push(err0);
                }
                errors++;
            }
        }
        if (data.types !== undefined) {
            let data0 = data.types;
            if (data0 && typeof data0 == 'object' && !Array.isArray(data0)) {
                for (const key1 in data0) {
                    if (pattern6.test(key1)) {
                        if (
                            !validate28(data0[key1], {
                                instancePath:
                                    instancePath +
                                    '/types/' +
                                    key1.replace(/~/g, '~0').replace(/\//g, '~1'),
                                parentData: data0,
                                parentDataProperty: key1,
                                rootData,
                            })
                        ) {
                            vErrors =
                                vErrors === null
                                    ? validate28.errors
                                    : vErrors.concat(validate28.errors);
                            errors = vErrors.length;
                        }
                    }
                }
            } else {
                const err1 = {
                    instancePath: instancePath + '/types',
                    schemaPath: '#/properties/types/type',
                    keyword: 'type',
                    params: { type: 'object' },
                    message: 'must be object',
                };
                if (vErrors === null) {
                    vErrors = [err1];
                } else {
                    vErrors.push(err1);
                }
                errors++;
            }
        }
        if (data.fields !== undefined) {
            let data2 = data.fields;
            if (data2 && typeof data2 == 'object' && !Array.isArray(data2)) {
                for (const key2 in data2) {
                    if (pattern6.test(key2)) {
                        let data3 = data2[key2];
                        const _errs8 = errors;
                        let valid3 = false;
                        const _errs9 = errors;
                        if (data3 && typeof data3 == 'object' && !Array.isArray(data3)) {
                            for (const key3 in data3) {
                                if (!(key3 === 'label' || key3 === 'hint')) {
                                    const err2 = {
                                        instancePath:
                                            instancePath +
                                            '/fields/' +
                                            key2.replace(/~/g, '~0').replace(/\//g, '~1'),
                                        schemaPath:
                                            '#/definitions/FieldLocalization/additionalProperties',
                                        keyword: 'additionalProperties',
                                        params: { additionalProperty: key3 },
                                        message: 'must NOT have additional properties',
                                    };
                                    if (vErrors === null) {
                                        vErrors = [err2];
                                    } else {
                                        vErrors.push(err2);
                                    }
                                    errors++;
                                }
                            }
                            if (data3.label !== undefined) {
                                if (typeof data3.label !== 'string') {
                                    const err3 = {
                                        instancePath:
                                            instancePath +
                                            '/fields/' +
                                            key2.replace(/~/g, '~0').replace(/\//g, '~1') +
                                            '/label',
                                        schemaPath:
                                            '#/definitions/FieldLocalization/properties/label/type',
                                        keyword: 'type',
                                        params: { type: 'string' },
                                        message: 'must be string',
                                    };
                                    if (vErrors === null) {
                                        vErrors = [err3];
                                    } else {
                                        vErrors.push(err3);
                                    }
                                    errors++;
                                }
                            }
                            if (data3.hint !== undefined) {
                                if (typeof data3.hint !== 'string') {
                                    const err4 = {
                                        instancePath:
                                            instancePath +
                                            '/fields/' +
                                            key2.replace(/~/g, '~0').replace(/\//g, '~1') +
                                            '/hint',
                                        schemaPath:
                                            '#/definitions/FieldLocalization/properties/hint/type',
                                        keyword: 'type',
                                        params: { type: 'string' },
                                        message: 'must be string',
                                    };
                                    if (vErrors === null) {
                                        vErrors = [err4];
                                    } else {
                                        vErrors.push(err4);
                                    }
                                    errors++;
                                }
                            }
                        } else {
                            const err5 = {
                                instancePath:
                                    instancePath +
                                    '/fields/' +
                                    key2.replace(/~/g, '~0').replace(/\//g, '~1'),
                                schemaPath: '#/definitions/FieldLocalization/type',
                                keyword: 'type',
                                params: { type: 'object' },
                                message: 'must be object',
                            };
                            if (vErrors === null) {
                                vErrors = [err5];
                            } else {
                                vErrors.push(err5);
                            }
                            errors++;
                        }
                        var _valid0 = _errs9 === errors;
                        valid3 = valid3 || _valid0;
                        if (!valid3) {
                            const _errs17 = errors;
                            if (typeof data3 !== 'string') {
                                const err6 = {
                                    instancePath:
                                        instancePath +
                                        '/fields/' +
                                        key2.replace(/~/g, '~0').replace(/\//g, '~1'),
                                    schemaPath:
                                        '#/properties/fields/patternProperties/%5E%5Ba-zA-Z0-9_%5D%2B%24/anyOf/1/type',
                                    keyword: 'type',
                                    params: { type: 'string' },
                                    message: 'must be string',
                                };
                                if (vErrors === null) {
                                    vErrors = [err6];
                                } else {
                                    vErrors.push(err6);
                                }
                                errors++;
                            }
                            var _valid0 = _errs17 === errors;
                            valid3 = valid3 || _valid0;
                        }
                        if (!valid3) {
                            const err7 = {
                                instancePath:
                                    instancePath +
                                    '/fields/' +
                                    key2.replace(/~/g, '~0').replace(/\//g, '~1'),
                                schemaPath:
                                    '#/properties/fields/patternProperties/%5E%5Ba-zA-Z0-9_%5D%2B%24/anyOf',
                                keyword: 'anyOf',
                                params: {},
                                message: 'must match a schema in anyOf',
                            };
                            if (vErrors === null) {
                                vErrors = [err7];
                            } else {
                                vErrors.push(err7);
                            }
                            errors++;
                        } else {
                            errors = _errs8;
                            if (vErrors !== null) {
                                if (_errs8) {
                                    vErrors.length = _errs8;
                                } else {
                                    vErrors = null;
                                }
                            }
                        }
                    }
                }
            } else {
                const err8 = {
                    instancePath: instancePath + '/fields',
                    schemaPath: '#/properties/fields/type',
                    keyword: 'type',
                    params: { type: 'object' },
                    message: 'must be object',
                };
                if (vErrors === null) {
                    vErrors = [err8];
                } else {
                    vErrors.push(err8);
                }
                errors++;
            }
        }
    } else {
        const err9 = {
            instancePath,
            schemaPath: '#/type',
            keyword: 'type',
            params: { type: 'object' },
            message: 'must be object',
        };
        if (vErrors === null) {
            vErrors = [err9];
        } else {
            vErrors.push(err9);
        }
        errors++;
    }
    validate27.errors = vErrors;
    return errors === 0;
}
function validate20(
    data,
    { instancePath = '', parentData, parentDataProperty, rootData = data } = {},
) {
    let vErrors = null;
    let errors = 0;
    if (data && typeof data == 'object' && !Array.isArray(data)) {
        if (Object.keys(data).length < 1) {
            const err0 = {
                instancePath,
                schemaPath: '#/minProperties',
                keyword: 'minProperties',
                params: { limit: 1 },
                message: 'must NOT have fewer than 1 properties',
            };
            if (vErrors === null) {
                vErrors = [err0];
            } else {
                vErrors.push(err0);
            }
            errors++;
        }
        for (const key0 in data) {
            if (
                !(
                    key0 === 'permissionProfiles' ||
                    key0 === 'i18n' ||
                    key0 === 'billing' ||
                    key0 === 'timeToLive' ||
                    key0 === 'modules'
                )
            ) {
                const err1 = {
                    instancePath,
                    schemaPath: '#/additionalProperties',
                    keyword: 'additionalProperties',
                    params: { additionalProperty: key0 },
                    message: 'must NOT have additional properties',
                };
                if (vErrors === null) {
                    vErrors = [err1];
                } else {
                    vErrors.push(err1);
                }
                errors++;
            }
        }
        if (data.permissionProfiles !== undefined) {
            let data0 = data.permissionProfiles;
            if (data0 && typeof data0 == 'object' && !Array.isArray(data0)) {
                for (const key1 in data0) {
                    if (!pattern0.test(key1)) {
                        const err2 = {
                            instancePath: instancePath + '/permissionProfiles',
                            schemaPath: '#/properties/permissionProfiles/additionalProperties',
                            keyword: 'additionalProperties',
                            params: { additionalProperty: key1 },
                            message: 'must NOT have additional properties',
                        };
                        if (vErrors === null) {
                            vErrors = [err2];
                        } else {
                            vErrors.push(err2);
                        }
                        errors++;
                    }
                }
                for (const key2 in data0) {
                    if (pattern0.test(key2)) {
                        if (
                            !validate21(data0[key2], {
                                instancePath:
                                    instancePath +
                                    '/permissionProfiles/' +
                                    key2.replace(/~/g, '~0').replace(/\//g, '~1'),
                                parentData: data0,
                                parentDataProperty: key2,
                                rootData,
                            })
                        ) {
                            vErrors =
                                vErrors === null
                                    ? validate21.errors
                                    : vErrors.concat(validate21.errors);
                            errors = vErrors.length;
                        }
                    }
                }
            } else {
                const err3 = {
                    instancePath: instancePath + '/permissionProfiles',
                    schemaPath: '#/properties/permissionProfiles/type',
                    keyword: 'type',
                    params: { type: 'object' },
                    message: 'must be object',
                };
                if (vErrors === null) {
                    vErrors = [err3];
                } else {
                    vErrors.push(err3);
                }
                errors++;
            }
        }
        if (data.i18n !== undefined) {
            let data2 = data.i18n;
            if (data2 && typeof data2 == 'object' && !Array.isArray(data2)) {
                for (const key3 in data2) {
                    if (!pattern4.test(key3)) {
                        const err4 = {
                            instancePath: instancePath + '/i18n',
                            schemaPath: '#/properties/i18n/additionalProperties',
                            keyword: 'additionalProperties',
                            params: { additionalProperty: key3 },
                            message: 'must NOT have additional properties',
                        };
                        if (vErrors === null) {
                            vErrors = [err4];
                        } else {
                            vErrors.push(err4);
                        }
                        errors++;
                    }
                }
                for (const key4 in data2) {
                    if (pattern4.test(key4)) {
                        if (
                            !validate27(data2[key4], {
                                instancePath:
                                    instancePath +
                                    '/i18n/' +
                                    key4.replace(/~/g, '~0').replace(/\//g, '~1'),
                                parentData: data2,
                                parentDataProperty: key4,
                                rootData,
                            })
                        ) {
                            vErrors =
                                vErrors === null
                                    ? validate27.errors
                                    : vErrors.concat(validate27.errors);
                            errors = vErrors.length;
                        }
                    }
                }
            } else {
                const err5 = {
                    instancePath: instancePath + '/i18n',
                    schemaPath: '#/properties/i18n/type',
                    keyword: 'type',
                    params: { type: 'object' },
                    message: 'must be object',
                };
                if (vErrors === null) {
                    vErrors = [err5];
                } else {
                    vErrors.push(err5);
                }
                errors++;
            }
        }
        if (data.billing !== undefined) {
            let data4 = data.billing;
            if (data4 && typeof data4 == 'object' && !Array.isArray(data4)) {
                for (const key5 in data4) {
                    if (!(key5 === 'billingEntities')) {
                        const err6 = {
                            instancePath: instancePath + '/billing',
                            schemaPath: '#/properties/billing/additionalProperties',
                            keyword: 'additionalProperties',
                            params: { additionalProperty: key5 },
                            message: 'must NOT have additional properties',
                        };
                        if (vErrors === null) {
                            vErrors = [err6];
                        } else {
                            vErrors.push(err6);
                        }
                        errors++;
                    }
                }
                if (data4.billingEntities !== undefined) {
                    let data5 = data4.billingEntities;
                    if (Array.isArray(data5)) {
                        const len0 = data5.length;
                        for (let i0 = 0; i0 < len0; i0++) {
                            let data6 = data5[i0];
                            if (data6 && typeof data6 == 'object' && !Array.isArray(data6)) {
                                if (data6.typeName === undefined) {
                                    const err7 = {
                                        instancePath:
                                            instancePath + '/billing/billingEntities/' + i0,
                                        schemaPath:
                                            '#/properties/billing/properties/billingEntities/items/required',
                                        keyword: 'required',
                                        params: { missingProperty: 'typeName' },
                                        message: "must have required property '" + 'typeName' + "'",
                                    };
                                    if (vErrors === null) {
                                        vErrors = [err7];
                                    } else {
                                        vErrors.push(err7);
                                    }
                                    errors++;
                                }
                                for (const key6 in data6) {
                                    if (
                                        !(
                                            key6 === 'typeName' ||
                                            key6 === 'keyFieldName' ||
                                            key6 === 'quantityFieldName' ||
                                            key6 === 'category' ||
                                            key6 === 'categoryMapping'
                                        )
                                    ) {
                                        const err8 = {
                                            instancePath:
                                                instancePath + '/billing/billingEntities/' + i0,
                                            schemaPath:
                                                '#/properties/billing/properties/billingEntities/items/additionalProperties',
                                            keyword: 'additionalProperties',
                                            params: { additionalProperty: key6 },
                                            message: 'must NOT have additional properties',
                                        };
                                        if (vErrors === null) {
                                            vErrors = [err8];
                                        } else {
                                            vErrors.push(err8);
                                        }
                                        errors++;
                                    }
                                }
                                if (data6.typeName !== undefined) {
                                    let data7 = data6.typeName;
                                    if (typeof data7 === 'string') {
                                        if (!pattern4.test(data7)) {
                                            const err9 = {
                                                instancePath:
                                                    instancePath +
                                                    '/billing/billingEntities/' +
                                                    i0 +
                                                    '/typeName',
                                                schemaPath:
                                                    '#/properties/billing/properties/billingEntities/items/properties/typeName/pattern',
                                                keyword: 'pattern',
                                                params: { pattern: '^[a-zA-Z0-9_-]+$' },
                                                message:
                                                    'must match pattern "' +
                                                    '^[a-zA-Z0-9_-]+$' +
                                                    '"',
                                            };
                                            if (vErrors === null) {
                                                vErrors = [err9];
                                            } else {
                                                vErrors.push(err9);
                                            }
                                            errors++;
                                        }
                                    } else {
                                        const err10 = {
                                            instancePath:
                                                instancePath +
                                                '/billing/billingEntities/' +
                                                i0 +
                                                '/typeName',
                                            schemaPath:
                                                '#/properties/billing/properties/billingEntities/items/properties/typeName/type',
                                            keyword: 'type',
                                            params: { type: 'string' },
                                            message: 'must be string',
                                        };
                                        if (vErrors === null) {
                                            vErrors = [err10];
                                        } else {
                                            vErrors.push(err10);
                                        }
                                        errors++;
                                    }
                                }
                                if (data6.keyFieldName !== undefined) {
                                    let data8 = data6.keyFieldName;
                                    if (typeof data8 === 'string') {
                                        if (!pattern4.test(data8)) {
                                            const err11 = {
                                                instancePath:
                                                    instancePath +
                                                    '/billing/billingEntities/' +
                                                    i0 +
                                                    '/keyFieldName',
                                                schemaPath:
                                                    '#/properties/billing/properties/billingEntities/items/properties/keyFieldName/pattern',
                                                keyword: 'pattern',
                                                params: { pattern: '^[a-zA-Z0-9_-]+$' },
                                                message:
                                                    'must match pattern "' +
                                                    '^[a-zA-Z0-9_-]+$' +
                                                    '"',
                                            };
                                            if (vErrors === null) {
                                                vErrors = [err11];
                                            } else {
                                                vErrors.push(err11);
                                            }
                                            errors++;
                                        }
                                    } else {
                                        const err12 = {
                                            instancePath:
                                                instancePath +
                                                '/billing/billingEntities/' +
                                                i0 +
                                                '/keyFieldName',
                                            schemaPath:
                                                '#/properties/billing/properties/billingEntities/items/properties/keyFieldName/type',
                                            keyword: 'type',
                                            params: { type: 'string' },
                                            message: 'must be string',
                                        };
                                        if (vErrors === null) {
                                            vErrors = [err12];
                                        } else {
                                            vErrors.push(err12);
                                        }
                                        errors++;
                                    }
                                }
                                if (data6.quantityFieldName !== undefined) {
                                    if (typeof data6.quantityFieldName !== 'string') {
                                        const err13 = {
                                            instancePath:
                                                instancePath +
                                                '/billing/billingEntities/' +
                                                i0 +
                                                '/quantityFieldName',
                                            schemaPath:
                                                '#/properties/billing/properties/billingEntities/items/properties/quantityFieldName/type',
                                            keyword: 'type',
                                            params: { type: 'string' },
                                            message: 'must be string',
                                        };
                                        if (vErrors === null) {
                                            vErrors = [err13];
                                        } else {
                                            vErrors.push(err13);
                                        }
                                        errors++;
                                    }
                                }
                                if (data6.category !== undefined) {
                                    if (typeof data6.category !== 'string') {
                                        const err14 = {
                                            instancePath:
                                                instancePath +
                                                '/billing/billingEntities/' +
                                                i0 +
                                                '/category',
                                            schemaPath:
                                                '#/properties/billing/properties/billingEntities/items/properties/category/type',
                                            keyword: 'type',
                                            params: { type: 'string' },
                                            message: 'must be string',
                                        };
                                        if (vErrors === null) {
                                            vErrors = [err14];
                                        } else {
                                            vErrors.push(err14);
                                        }
                                        errors++;
                                    }
                                }
                                if (data6.categoryMapping !== undefined) {
                                    let data11 = data6.categoryMapping;
                                    if (
                                        data11 &&
                                        typeof data11 == 'object' &&
                                        !Array.isArray(data11)
                                    ) {
                                        if (data11.fieldName === undefined) {
                                            const err15 = {
                                                instancePath:
                                                    instancePath +
                                                    '/billing/billingEntities/' +
                                                    i0 +
                                                    '/categoryMapping',
                                                schemaPath:
                                                    '#/properties/billing/properties/billingEntities/items/properties/categoryMapping/required',
                                                keyword: 'required',
                                                params: { missingProperty: 'fieldName' },
                                                message:
                                                    "must have required property '" +
                                                    'fieldName' +
                                                    "'",
                                            };
                                            if (vErrors === null) {
                                                vErrors = [err15];
                                            } else {
                                                vErrors.push(err15);
                                            }
                                            errors++;
                                        }
                                        if (data11.defaultValue === undefined) {
                                            const err16 = {
                                                instancePath:
                                                    instancePath +
                                                    '/billing/billingEntities/' +
                                                    i0 +
                                                    '/categoryMapping',
                                                schemaPath:
                                                    '#/properties/billing/properties/billingEntities/items/properties/categoryMapping/required',
                                                keyword: 'required',
                                                params: { missingProperty: 'defaultValue' },
                                                message:
                                                    "must have required property '" +
                                                    'defaultValue' +
                                                    "'",
                                            };
                                            if (vErrors === null) {
                                                vErrors = [err16];
                                            } else {
                                                vErrors.push(err16);
                                            }
                                            errors++;
                                        }
                                        if (data11.values === undefined) {
                                            const err17 = {
                                                instancePath:
                                                    instancePath +
                                                    '/billing/billingEntities/' +
                                                    i0 +
                                                    '/categoryMapping',
                                                schemaPath:
                                                    '#/properties/billing/properties/billingEntities/items/properties/categoryMapping/required',
                                                keyword: 'required',
                                                params: { missingProperty: 'values' },
                                                message:
                                                    "must have required property '" +
                                                    'values' +
                                                    "'",
                                            };
                                            if (vErrors === null) {
                                                vErrors = [err17];
                                            } else {
                                                vErrors.push(err17);
                                            }
                                            errors++;
                                        }
                                        for (const key7 in data11) {
                                            if (
                                                !(
                                                    key7 === 'fieldName' ||
                                                    key7 === 'defaultValue' ||
                                                    key7 === 'values'
                                                )
                                            ) {
                                                const err18 = {
                                                    instancePath:
                                                        instancePath +
                                                        '/billing/billingEntities/' +
                                                        i0 +
                                                        '/categoryMapping',
                                                    schemaPath:
                                                        '#/properties/billing/properties/billingEntities/items/properties/categoryMapping/additionalProperties',
                                                    keyword: 'additionalProperties',
                                                    params: { additionalProperty: key7 },
                                                    message: 'must NOT have additional properties',
                                                };
                                                if (vErrors === null) {
                                                    vErrors = [err18];
                                                } else {
                                                    vErrors.push(err18);
                                                }
                                                errors++;
                                            }
                                        }
                                        if (data11.fieldName !== undefined) {
                                            if (typeof data11.fieldName !== 'string') {
                                                const err19 = {
                                                    instancePath:
                                                        instancePath +
                                                        '/billing/billingEntities/' +
                                                        i0 +
                                                        '/categoryMapping/fieldName',
                                                    schemaPath:
                                                        '#/properties/billing/properties/billingEntities/items/properties/categoryMapping/properties/fieldName/type',
                                                    keyword: 'type',
                                                    params: { type: 'string' },
                                                    message: 'must be string',
                                                };
                                                if (vErrors === null) {
                                                    vErrors = [err19];
                                                } else {
                                                    vErrors.push(err19);
                                                }
                                                errors++;
                                            }
                                        }
                                        if (data11.defaultValue !== undefined) {
                                            let data13 = data11.defaultValue;
                                            if (typeof data13 === 'string') {
                                                if (!pattern4.test(data13)) {
                                                    const err20 = {
                                                        instancePath:
                                                            instancePath +
                                                            '/billing/billingEntities/' +
                                                            i0 +
                                                            '/categoryMapping/defaultValue',
                                                        schemaPath:
                                                            '#/properties/billing/properties/billingEntities/items/properties/categoryMapping/properties/defaultValue/pattern',
                                                        keyword: 'pattern',
                                                        params: { pattern: '^[a-zA-Z0-9_-]+$' },
                                                        message:
                                                            'must match pattern "' +
                                                            '^[a-zA-Z0-9_-]+$' +
                                                            '"',
                                                    };
                                                    if (vErrors === null) {
                                                        vErrors = [err20];
                                                    } else {
                                                        vErrors.push(err20);
                                                    }
                                                    errors++;
                                                }
                                            } else {
                                                const err21 = {
                                                    instancePath:
                                                        instancePath +
                                                        '/billing/billingEntities/' +
                                                        i0 +
                                                        '/categoryMapping/defaultValue',
                                                    schemaPath:
                                                        '#/properties/billing/properties/billingEntities/items/properties/categoryMapping/properties/defaultValue/type',
                                                    keyword: 'type',
                                                    params: { type: 'string' },
                                                    message: 'must be string',
                                                };
                                                if (vErrors === null) {
                                                    vErrors = [err21];
                                                } else {
                                                    vErrors.push(err21);
                                                }
                                                errors++;
                                            }
                                        }
                                        if (data11.values !== undefined) {
                                            let data14 = data11.values;
                                            if (
                                                data14 &&
                                                typeof data14 == 'object' &&
                                                !Array.isArray(data14)
                                            ) {
                                                for (const key8 in data14) {
                                                    if (typeof data14[key8] !== 'string') {
                                                        const err22 = {
                                                            instancePath:
                                                                instancePath +
                                                                '/billing/billingEntities/' +
                                                                i0 +
                                                                '/categoryMapping/values/' +
                                                                key8
                                                                    .replace(/~/g, '~0')
                                                                    .replace(/\//g, '~1'),
                                                            schemaPath:
                                                                '#/properties/billing/properties/billingEntities/items/properties/categoryMapping/properties/values/additionalProperties/type',
                                                            keyword: 'type',
                                                            params: { type: 'string' },
                                                            message: 'must be string',
                                                        };
                                                        if (vErrors === null) {
                                                            vErrors = [err22];
                                                        } else {
                                                            vErrors.push(err22);
                                                        }
                                                        errors++;
                                                    }
                                                }
                                            } else {
                                                const err23 = {
                                                    instancePath:
                                                        instancePath +
                                                        '/billing/billingEntities/' +
                                                        i0 +
                                                        '/categoryMapping/values',
                                                    schemaPath:
                                                        '#/properties/billing/properties/billingEntities/items/properties/categoryMapping/properties/values/type',
                                                    keyword: 'type',
                                                    params: { type: 'object' },
                                                    message: 'must be object',
                                                };
                                                if (vErrors === null) {
                                                    vErrors = [err23];
                                                } else {
                                                    vErrors.push(err23);
                                                }
                                                errors++;
                                            }
                                        }
                                    } else {
                                        const err24 = {
                                            instancePath:
                                                instancePath +
                                                '/billing/billingEntities/' +
                                                i0 +
                                                '/categoryMapping',
                                            schemaPath:
                                                '#/properties/billing/properties/billingEntities/items/properties/categoryMapping/type',
                                            keyword: 'type',
                                            params: { type: 'object' },
                                            message: 'must be object',
                                        };
                                        if (vErrors === null) {
                                            vErrors = [err24];
                                        } else {
                                            vErrors.push(err24);
                                        }
                                        errors++;
                                    }
                                }
                            } else {
                                const err25 = {
                                    instancePath: instancePath + '/billing/billingEntities/' + i0,
                                    schemaPath:
                                        '#/properties/billing/properties/billingEntities/items/type',
                                    keyword: 'type',
                                    params: { type: 'object' },
                                    message: 'must be object',
                                };
                                if (vErrors === null) {
                                    vErrors = [err25];
                                } else {
                                    vErrors.push(err25);
                                }
                                errors++;
                            }
                        }
                    } else {
                        const err26 = {
                            instancePath: instancePath + '/billing/billingEntities',
                            schemaPath: '#/properties/billing/properties/billingEntities/type',
                            keyword: 'type',
                            params: { type: 'array' },
                            message: 'must be array',
                        };
                        if (vErrors === null) {
                            vErrors = [err26];
                        } else {
                            vErrors.push(err26);
                        }
                        errors++;
                    }
                }
            } else {
                const err27 = {
                    instancePath: instancePath + '/billing',
                    schemaPath: '#/properties/billing/type',
                    keyword: 'type',
                    params: { type: 'object' },
                    message: 'must be object',
                };
                if (vErrors === null) {
                    vErrors = [err27];
                } else {
                    vErrors.push(err27);
                }
                errors++;
            }
        }
        if (data.timeToLive !== undefined) {
            let data16 = data.timeToLive;
            if (Array.isArray(data16)) {
                const len1 = data16.length;
                for (let i1 = 0; i1 < len1; i1++) {
                    let data17 = data16[i1];
                    if (data17 && typeof data17 == 'object' && !Array.isArray(data17)) {
                        if (data17.typeName === undefined) {
                            const err28 = {
                                instancePath: instancePath + '/timeToLive/' + i1,
                                schemaPath: '#/properties/timeToLive/items/required',
                                keyword: 'required',
                                params: { missingProperty: 'typeName' },
                                message: "must have required property '" + 'typeName' + "'",
                            };
                            if (vErrors === null) {
                                vErrors = [err28];
                            } else {
                                vErrors.push(err28);
                            }
                            errors++;
                        }
                        if (data17.dateField === undefined) {
                            const err29 = {
                                instancePath: instancePath + '/timeToLive/' + i1,
                                schemaPath: '#/properties/timeToLive/items/required',
                                keyword: 'required',
                                params: { missingProperty: 'dateField' },
                                message: "must have required property '" + 'dateField' + "'",
                            };
                            if (vErrors === null) {
                                vErrors = [err29];
                            } else {
                                vErrors.push(err29);
                            }
                            errors++;
                        }
                        if (data17.expireAfterDays === undefined) {
                            const err30 = {
                                instancePath: instancePath + '/timeToLive/' + i1,
                                schemaPath: '#/properties/timeToLive/items/required',
                                keyword: 'required',
                                params: { missingProperty: 'expireAfterDays' },
                                message: "must have required property '" + 'expireAfterDays' + "'",
                            };
                            if (vErrors === null) {
                                vErrors = [err30];
                            } else {
                                vErrors.push(err30);
                            }
                            errors++;
                        }
                        if (data17['typeName:'] !== undefined) {
                            let data18 = data17['typeName:'];
                            if (typeof data18 === 'string') {
                                if (!pattern4.test(data18)) {
                                    const err31 = {
                                        instancePath:
                                            instancePath + '/timeToLive/' + i1 + '/typeName:',
                                        schemaPath:
                                            '#/properties/timeToLive/items/properties/typeName%3A/pattern',
                                        keyword: 'pattern',
                                        params: { pattern: '^[a-zA-Z0-9_-]+$' },
                                        message: 'must match pattern "' + '^[a-zA-Z0-9_-]+$' + '"',
                                    };
                                    if (vErrors === null) {
                                        vErrors = [err31];
                                    } else {
                                        vErrors.push(err31);
                                    }
                                    errors++;
                                }
                            } else {
                                const err32 = {
                                    instancePath: instancePath + '/timeToLive/' + i1 + '/typeName:',
                                    schemaPath:
                                        '#/properties/timeToLive/items/properties/typeName%3A/type',
                                    keyword: 'type',
                                    params: { type: 'string' },
                                    message: 'must be string',
                                };
                                if (vErrors === null) {
                                    vErrors = [err32];
                                } else {
                                    vErrors.push(err32);
                                }
                                errors++;
                            }
                        }
                        if (data17['dateField:'] !== undefined) {
                            let data19 = data17['dateField:'];
                            if (typeof data19 === 'string') {
                                if (!pattern14.test(data19)) {
                                    const err33 = {
                                        instancePath:
                                            instancePath + '/timeToLive/' + i1 + '/dateField:',
                                        schemaPath:
                                            '#/properties/timeToLive/items/properties/dateField%3A/pattern',
                                        keyword: 'pattern',
                                        params: { pattern: '^([a-zA-Z0-9_-]|\\.)+$' },
                                        message:
                                            'must match pattern "' + '^([a-zA-Z0-9_-]|\\.)+$' + '"',
                                    };
                                    if (vErrors === null) {
                                        vErrors = [err33];
                                    } else {
                                        vErrors.push(err33);
                                    }
                                    errors++;
                                }
                            } else {
                                const err34 = {
                                    instancePath:
                                        instancePath + '/timeToLive/' + i1 + '/dateField:',
                                    schemaPath:
                                        '#/properties/timeToLive/items/properties/dateField%3A/type',
                                    keyword: 'type',
                                    params: { type: 'string' },
                                    message: 'must be string',
                                };
                                if (vErrors === null) {
                                    vErrors = [err34];
                                } else {
                                    vErrors.push(err34);
                                }
                                errors++;
                            }
                        }
                        if (data17.expireAfterDays !== undefined) {
                            let data20 = data17.expireAfterDays;
                            if (
                                !(
                                    typeof data20 == 'number' &&
                                    !(data20 % 1) &&
                                    !isNaN(data20) &&
                                    isFinite(data20)
                                )
                            ) {
                                const err35 = {
                                    instancePath:
                                        instancePath + '/timeToLive/' + i1 + '/expireAfterDays',
                                    schemaPath:
                                        '#/properties/timeToLive/items/properties/expireAfterDays/type',
                                    keyword: 'type',
                                    params: { type: 'integer' },
                                    message: 'must be integer',
                                };
                                if (vErrors === null) {
                                    vErrors = [err35];
                                } else {
                                    vErrors.push(err35);
                                }
                                errors++;
                            }
                            if (typeof data20 == 'number' && isFinite(data20)) {
                                if (data20 < 1 || isNaN(data20)) {
                                    const err36 = {
                                        instancePath:
                                            instancePath + '/timeToLive/' + i1 + '/expireAfterDays',
                                        schemaPath:
                                            '#/properties/timeToLive/items/properties/expireAfterDays/minimum',
                                        keyword: 'minimum',
                                        params: { comparison: '>=', limit: 1 },
                                        message: 'must be >= 1',
                                    };
                                    if (vErrors === null) {
                                        vErrors = [err36];
                                    } else {
                                        vErrors.push(err36);
                                    }
                                    errors++;
                                }
                            }
                        }
                        if (data17['cascadeFields:'] !== undefined) {
                            let data21 = data17['cascadeFields:'];
                            if (Array.isArray(data21)) {
                                const len2 = data21.length;
                                for (let i2 = 0; i2 < len2; i2++) {
                                    let data22 = data21[i2];
                                    if (typeof data22 === 'string') {
                                        if (!pattern14.test(data22)) {
                                            const err37 = {
                                                instancePath:
                                                    instancePath +
                                                    '/timeToLive/' +
                                                    i1 +
                                                    '/cascadeFields:/' +
                                                    i2,
                                                schemaPath:
                                                    '#/properties/timeToLive/items/properties/cascadeFields%3A/items/pattern',
                                                keyword: 'pattern',
                                                params: { pattern: '^([a-zA-Z0-9_-]|\\.)+$' },
                                                message:
                                                    'must match pattern "' +
                                                    '^([a-zA-Z0-9_-]|\\.)+$' +
                                                    '"',
                                            };
                                            if (vErrors === null) {
                                                vErrors = [err37];
                                            } else {
                                                vErrors.push(err37);
                                            }
                                            errors++;
                                        }
                                    } else {
                                        const err38 = {
                                            instancePath:
                                                instancePath +
                                                '/timeToLive/' +
                                                i1 +
                                                '/cascadeFields:/' +
                                                i2,
                                            schemaPath:
                                                '#/properties/timeToLive/items/properties/cascadeFields%3A/items/type',
                                            keyword: 'type',
                                            params: { type: 'string' },
                                            message: 'must be string',
                                        };
                                        if (vErrors === null) {
                                            vErrors = [err38];
                                        } else {
                                            vErrors.push(err38);
                                        }
                                        errors++;
                                    }
                                }
                            } else {
                                const err39 = {
                                    instancePath:
                                        instancePath + '/timeToLive/' + i1 + '/cascadeFields:',
                                    schemaPath:
                                        '#/properties/timeToLive/items/properties/cascadeFields%3A/type',
                                    keyword: 'type',
                                    params: { type: 'array' },
                                    message: 'must be array',
                                };
                                if (vErrors === null) {
                                    vErrors = [err39];
                                } else {
                                    vErrors.push(err39);
                                }
                                errors++;
                            }
                        }
                    } else {
                        const err40 = {
                            instancePath: instancePath + '/timeToLive/' + i1,
                            schemaPath: '#/properties/timeToLive/items/type',
                            keyword: 'type',
                            params: { type: 'object' },
                            message: 'must be object',
                        };
                        if (vErrors === null) {
                            vErrors = [err40];
                        } else {
                            vErrors.push(err40);
                        }
                        errors++;
                    }
                }
            } else {
                const err41 = {
                    instancePath: instancePath + '/timeToLive',
                    schemaPath: '#/properties/timeToLive/type',
                    keyword: 'type',
                    params: { type: 'array' },
                    message: 'must be array',
                };
                if (vErrors === null) {
                    vErrors = [err41];
                } else {
                    vErrors.push(err41);
                }
                errors++;
            }
        }
        if (data.modules !== undefined) {
            let data23 = data.modules;
            if (Array.isArray(data23)) {
                const len3 = data23.length;
                for (let i3 = 0; i3 < len3; i3++) {
                    if (typeof data23[i3] !== 'string') {
                        const err42 = {
                            instancePath: instancePath + '/modules/' + i3,
                            schemaPath: '#/properties/modules/items/type',
                            keyword: 'type',
                            params: { type: 'string' },
                            message: 'must be string',
                        };
                        if (vErrors === null) {
                            vErrors = [err42];
                        } else {
                            vErrors.push(err42);
                        }
                        errors++;
                    }
                }
            } else {
                const err43 = {
                    instancePath: instancePath + '/modules',
                    schemaPath: '#/properties/modules/type',
                    keyword: 'type',
                    params: { type: 'array' },
                    message: 'must be array',
                };
                if (vErrors === null) {
                    vErrors = [err43];
                } else {
                    vErrors.push(err43);
                }
                errors++;
            }
        }
    } else {
        const err44 = {
            instancePath,
            schemaPath: '#/type',
            keyword: 'type',
            params: { type: 'object' },
            message: 'must be object',
        };
        if (vErrors === null) {
            vErrors = [err44];
        } else {
            vErrors.push(err44);
        }
        errors++;
    }
    validate20.errors = vErrors;
    return errors === 0;
}
