'use strict';
var ucs2length = require('ajv/lib/compile/ucs2length');
var equal = require('ajv/lib/compile/equal');
var validate = (function() {
    var pattern0 = new RegExp('^[a-zA-Z0-9]+$');
    var pattern1 = new RegExp('.+');
    var pattern2 = new RegExp('^[a-zA-Z0-9_-]+$');
    var pattern3 = new RegExp('^[a-zA-Z0-9_]+$');
    var pattern4 = new RegExp('^([a-zA-Z0-9_-]|\\.)+$');
    var refVal = [];
    var refVal1 = (function() {
        var pattern0 = new RegExp('^[a-zA-Z0-9]+$');
        var pattern1 = new RegExp('.+');
        var pattern2 = new RegExp('^[a-zA-Z0-9_-]+$');
        var pattern3 = new RegExp('^[a-zA-Z0-9_]+$');
        var pattern4 = new RegExp('^([a-zA-Z0-9_-]|\\.)+$');
        return function validate(data, dataPath, parentData, parentDataProperty, rootData) {
            'use strict';
            var vErrors = null;
            var errors = 0;
            if (data && typeof data === 'object' && !Array.isArray(data)) {
                var errs__0 = errors;
                var valid1 = true;
                for (var key0 in data) {
                    var isAdditional0 = !(false || key0 == 'permissions');
                    if (isAdditional0) {
                        valid1 = false;
                        var err = {
                            keyword: 'additionalProperties',
                            dataPath: (dataPath || '') + '',
                            schemaPath: '#/additionalProperties',
                            params: {
                                additionalProperty: '' + key0 + ''
                            },
                            message: 'should NOT have additional properties'
                        };
                        if (vErrors === null) vErrors = [err];
                        else vErrors.push(err);
                        errors++;
                    }
                }
                var data1 = data.permissions;
                if (data1 !== undefined) {
                    var errs_1 = errors;
                    if (Array.isArray(data1)) {
                        var errs__1 = errors;
                        var valid1;
                        for (var i1 = 0; i1 < data1.length; i1++) {
                            var data2 = data1[i1];
                            var errs_2 = errors;
                            var errs_3 = errors;
                            if (data2 && typeof data2 === 'object' && !Array.isArray(data2)) {
                                var errs__3 = errors;
                                var valid4 = true;
                                for (var key3 in data2) {
                                    var isAdditional3 = !(
                                        false ||
                                        key3 == 'roles' ||
                                        key3 == 'access' ||
                                        key3 == 'restrictToAccessGroups'
                                    );
                                    if (isAdditional3) {
                                        valid4 = false;
                                        var err = {
                                            keyword: 'additionalProperties',
                                            dataPath: (dataPath || '') + '.permissions[' + i1 + ']',
                                            schemaPath: '#/definitions/Permission/additionalProperties',
                                            params: {
                                                additionalProperty: '' + key3 + ''
                                            },
                                            message: 'should NOT have additional properties'
                                        };
                                        if (vErrors === null) vErrors = [err];
                                        else vErrors.push(err);
                                        errors++;
                                    }
                                }
                                var data3 = data2.roles;
                                if (data3 === undefined) {
                                    valid4 = false;
                                    var err = {
                                        keyword: 'required',
                                        dataPath: (dataPath || '') + '.permissions[' + i1 + ']',
                                        schemaPath: '#/definitions/Permission/required',
                                        params: {
                                            missingProperty: 'roles'
                                        },
                                        message: "should have required property 'roles'"
                                    };
                                    if (vErrors === null) vErrors = [err];
                                    else vErrors.push(err);
                                    errors++;
                                } else {
                                    var errs_4 = errors;
                                    if (typeof data3 === 'string') {
                                        if (ucs2length(data3) < 1) {
                                            var err = {
                                                keyword: 'minLength',
                                                dataPath: (dataPath || '') + '.permissions[' + i1 + '].roles',
                                                schemaPath: '#/definitions/Permission/properties/roles/minLength',
                                                params: {
                                                    limit: 1
                                                },
                                                message: 'should NOT be shorter than 1 characters'
                                            };
                                            if (vErrors === null) vErrors = [err];
                                            else vErrors.push(err);
                                            errors++;
                                        }
                                    }
                                    if (Array.isArray(data3)) {
                                        var errs__4 = errors;
                                        var valid4;
                                        for (var i4 = 0; i4 < data3.length; i4++) {
                                            var data4 = data3[i4];
                                            var errs_5 = errors;
                                            if (typeof data4 === 'string') {
                                                if (!pattern1.test(data4)) {
                                                    var err = {
                                                        keyword: 'pattern',
                                                        dataPath:
                                                            (dataPath || '') +
                                                            '.permissions[' +
                                                            i1 +
                                                            '].roles[' +
                                                            i4 +
                                                            ']',
                                                        schemaPath:
                                                            '#/definitions/Permission/properties/roles/items/pattern',
                                                        params: {
                                                            pattern: '.+'
                                                        },
                                                        message: 'should match pattern ".+"'
                                                    };
                                                    if (vErrors === null) vErrors = [err];
                                                    else vErrors.push(err);
                                                    errors++;
                                                }
                                            } else {
                                                var err = {
                                                    keyword: 'type',
                                                    dataPath:
                                                        (dataPath || '') + '.permissions[' + i1 + '].roles[' + i4 + ']',
                                                    schemaPath: '#/definitions/Permission/properties/roles/items/type',
                                                    params: {
                                                        type: 'string'
                                                    },
                                                    message: 'should be string'
                                                };
                                                if (vErrors === null) vErrors = [err];
                                                else vErrors.push(err);
                                                errors++;
                                            }
                                            var valid5 = errors === errs_5;
                                        }
                                    } else {
                                        var err = {
                                            keyword: 'type',
                                            dataPath: (dataPath || '') + '.permissions[' + i1 + '].roles',
                                            schemaPath: '#/definitions/Permission/properties/roles/type',
                                            params: {
                                                type: 'array'
                                            },
                                            message: 'should be array'
                                        };
                                        if (vErrors === null) vErrors = [err];
                                        else vErrors.push(err);
                                        errors++;
                                    }
                                    var valid4 = errors === errs_4;
                                }
                                var data3 = data2.access;
                                if (data3 === undefined) {
                                    valid4 = false;
                                    var err = {
                                        keyword: 'required',
                                        dataPath: (dataPath || '') + '.permissions[' + i1 + ']',
                                        schemaPath: '#/definitions/Permission/required',
                                        params: {
                                            missingProperty: 'access'
                                        },
                                        message: "should have required property 'access'"
                                    };
                                    if (vErrors === null) vErrors = [err];
                                    else vErrors.push(err);
                                    errors++;
                                } else {
                                    var errs_4 = errors;
                                    var errs__4 = errors,
                                        prevValid4 = false,
                                        valid4 = false,
                                        passingSchemas4 = null;
                                    var errs_5 = errors;
                                    if (typeof data3 !== 'string') {
                                        var err = {
                                            keyword: 'type',
                                            dataPath: (dataPath || '') + '.permissions[' + i1 + '].access',
                                            schemaPath: '#/definitions/Permission/properties/access/oneOf/0/type',
                                            params: {
                                                type: 'string'
                                            },
                                            message: 'should be string'
                                        };
                                        if (vErrors === null) vErrors = [err];
                                        else vErrors.push(err);
                                        errors++;
                                    }
                                    var schema5 = refVal2.properties.access.oneOf[0].enum;
                                    var valid5;
                                    valid5 = false;
                                    for (var i5 = 0; i5 < schema5.length; i5++)
                                        if (equal(data3, schema5[i5])) {
                                            valid5 = true;
                                            break;
                                        }
                                    if (!valid5) {
                                        var err = {
                                            keyword: 'enum',
                                            dataPath: (dataPath || '') + '.permissions[' + i1 + '].access',
                                            schemaPath: '#/definitions/Permission/properties/access/oneOf/0/enum',
                                            params: {
                                                allowedValues: schema5
                                            },
                                            message: 'should be equal to one of the allowed values'
                                        };
                                        if (vErrors === null) vErrors = [err];
                                        else vErrors.push(err);
                                        errors++;
                                    }
                                    var valid5 = errors === errs_5;
                                    if (valid5) {
                                        valid4 = prevValid4 = true;
                                        passingSchemas4 = 0;
                                    }
                                    var errs_5 = errors;
                                    if (Array.isArray(data3)) {
                                        if (data3.length < 1) {
                                            var err = {
                                                keyword: 'minItems',
                                                dataPath: (dataPath || '') + '.permissions[' + i1 + '].access',
                                                schemaPath:
                                                    '#/definitions/Permission/properties/access/oneOf/1/minItems',
                                                params: {
                                                    limit: 1
                                                },
                                                message: 'should NOT have fewer than 1 items'
                                            };
                                            if (vErrors === null) vErrors = [err];
                                            else vErrors.push(err);
                                            errors++;
                                        }
                                        var errs__5 = errors;
                                        var valid5;
                                        for (var i5 = 0; i5 < data3.length; i5++) {
                                            var data4 = data3[i5];
                                            var errs_6 = errors;
                                            if (typeof data4 !== 'string') {
                                                var err = {
                                                    keyword: 'type',
                                                    dataPath:
                                                        (dataPath || '') +
                                                        '.permissions[' +
                                                        i1 +
                                                        '].access[' +
                                                        i5 +
                                                        ']',
                                                    schemaPath:
                                                        '#/definitions/Permission/properties/access/oneOf/1/items/type',
                                                    params: {
                                                        type: 'string'
                                                    },
                                                    message: 'should be string'
                                                };
                                                if (vErrors === null) vErrors = [err];
                                                else vErrors.push(err);
                                                errors++;
                                            }
                                            var schema6 = refVal2.properties.access.oneOf[1].items.enum;
                                            var valid6;
                                            valid6 = false;
                                            for (var i6 = 0; i6 < schema6.length; i6++)
                                                if (equal(data4, schema6[i6])) {
                                                    valid6 = true;
                                                    break;
                                                }
                                            if (!valid6) {
                                                var err = {
                                                    keyword: 'enum',
                                                    dataPath:
                                                        (dataPath || '') +
                                                        '.permissions[' +
                                                        i1 +
                                                        '].access[' +
                                                        i5 +
                                                        ']',
                                                    schemaPath:
                                                        '#/definitions/Permission/properties/access/oneOf/1/items/enum',
                                                    params: {
                                                        allowedValues: schema6
                                                    },
                                                    message: 'should be equal to one of the allowed values'
                                                };
                                                if (vErrors === null) vErrors = [err];
                                                else vErrors.push(err);
                                                errors++;
                                            }
                                            var valid6 = errors === errs_6;
                                        }
                                    } else {
                                        var err = {
                                            keyword: 'type',
                                            dataPath: (dataPath || '') + '.permissions[' + i1 + '].access',
                                            schemaPath: '#/definitions/Permission/properties/access/oneOf/1/type',
                                            params: {
                                                type: 'array'
                                            },
                                            message: 'should be array'
                                        };
                                        if (vErrors === null) vErrors = [err];
                                        else vErrors.push(err);
                                        errors++;
                                    }
                                    var valid5 = errors === errs_5;
                                    if (valid5 && prevValid4) {
                                        valid4 = false;
                                        passingSchemas4 = [passingSchemas4, 1];
                                    } else {
                                        if (valid5) {
                                            valid4 = prevValid4 = true;
                                            passingSchemas4 = 1;
                                        }
                                    }
                                    if (!valid4) {
                                        var err = {
                                            keyword: 'oneOf',
                                            dataPath: (dataPath || '') + '.permissions[' + i1 + '].access',
                                            schemaPath: '#/definitions/Permission/properties/access/oneOf',
                                            params: {
                                                passingSchemas: passingSchemas4
                                            },
                                            message: 'should match exactly one schema in oneOf'
                                        };
                                        if (vErrors === null) vErrors = [err];
                                        else vErrors.push(err);
                                        errors++;
                                    } else {
                                        errors = errs__4;
                                        if (vErrors !== null) {
                                            if (errs__4) vErrors.length = errs__4;
                                            else vErrors = null;
                                        }
                                    }
                                    var valid4 = errors === errs_4;
                                }
                                var data3 = data2.restrictToAccessGroups;
                                if (data3 !== undefined) {
                                    var errs_4 = errors;
                                    if (typeof data3 === 'string') {
                                        if (ucs2length(data3) < 1) {
                                            var err = {
                                                keyword: 'minLength',
                                                dataPath:
                                                    (dataPath || '') +
                                                    '.permissions[' +
                                                    i1 +
                                                    '].restrictToAccessGroups',
                                                schemaPath:
                                                    '#/definitions/Permission/properties/restrictToAccessGroups/minLength',
                                                params: {
                                                    limit: 1
                                                },
                                                message: 'should NOT be shorter than 1 characters'
                                            };
                                            if (vErrors === null) vErrors = [err];
                                            else vErrors.push(err);
                                            errors++;
                                        }
                                    }
                                    if (Array.isArray(data3)) {
                                        var errs__4 = errors;
                                        var valid4;
                                        for (var i4 = 0; i4 < data3.length; i4++) {
                                            var data4 = data3[i4];
                                            var errs_5 = errors;
                                            if (typeof data4 === 'string') {
                                                if (!pattern1.test(data4)) {
                                                    var err = {
                                                        keyword: 'pattern',
                                                        dataPath:
                                                            (dataPath || '') +
                                                            '.permissions[' +
                                                            i1 +
                                                            '].restrictToAccessGroups[' +
                                                            i4 +
                                                            ']',
                                                        schemaPath:
                                                            '#/definitions/Permission/properties/restrictToAccessGroups/items/pattern',
                                                        params: {
                                                            pattern: '.+'
                                                        },
                                                        message: 'should match pattern ".+"'
                                                    };
                                                    if (vErrors === null) vErrors = [err];
                                                    else vErrors.push(err);
                                                    errors++;
                                                }
                                            } else {
                                                var err = {
                                                    keyword: 'type',
                                                    dataPath:
                                                        (dataPath || '') +
                                                        '.permissions[' +
                                                        i1 +
                                                        '].restrictToAccessGroups[' +
                                                        i4 +
                                                        ']',
                                                    schemaPath:
                                                        '#/definitions/Permission/properties/restrictToAccessGroups/items/type',
                                                    params: {
                                                        type: 'string'
                                                    },
                                                    message: 'should be string'
                                                };
                                                if (vErrors === null) vErrors = [err];
                                                else vErrors.push(err);
                                                errors++;
                                            }
                                            var valid5 = errors === errs_5;
                                        }
                                    } else {
                                        var err = {
                                            keyword: 'type',
                                            dataPath:
                                                (dataPath || '') + '.permissions[' + i1 + '].restrictToAccessGroups',
                                            schemaPath:
                                                '#/definitions/Permission/properties/restrictToAccessGroups/type',
                                            params: {
                                                type: 'array'
                                            },
                                            message: 'should be array'
                                        };
                                        if (vErrors === null) vErrors = [err];
                                        else vErrors.push(err);
                                        errors++;
                                    }
                                    var valid4 = errors === errs_4;
                                }
                            } else {
                                var err = {
                                    keyword: 'type',
                                    dataPath: (dataPath || '') + '.permissions[' + i1 + ']',
                                    schemaPath: '#/definitions/Permission/type',
                                    params: {
                                        type: 'object'
                                    },
                                    message: 'should be object'
                                };
                                if (vErrors === null) vErrors = [err];
                                else vErrors.push(err);
                                errors++;
                            }
                            var valid3 = errors === errs_3;
                            var valid2 = errors === errs_2;
                        }
                    } else {
                        var err = {
                            keyword: 'type',
                            dataPath: (dataPath || '') + '.permissions',
                            schemaPath: '#/properties/permissions/type',
                            params: {
                                type: 'array'
                            },
                            message: 'should be array'
                        };
                        if (vErrors === null) vErrors = [err];
                        else vErrors.push(err);
                        errors++;
                    }
                    var valid1 = errors === errs_1;
                }
            } else {
                var err = {
                    keyword: 'type',
                    dataPath: (dataPath || '') + '',
                    schemaPath: '#/type',
                    params: {
                        type: 'object'
                    },
                    message: 'should be object'
                };
                if (vErrors === null) vErrors = [err];
                else vErrors.push(err);
                errors++;
            }
            validate.errors = vErrors;
            return errors === 0;
        };
    })();
    refVal1.schema = {
        type: 'object',
        additionalProperties: false,
        properties: {
            permissions: {
                type: 'array',
                items: {
                    $ref: '#/definitions/Permission'
                }
            }
        }
    };
    refVal1.errors = null;
    refVal[1] = refVal1;
    var refVal2 = {
        type: 'object',
        required: ['roles', 'access'],
        additionalProperties: false,
        properties: {
            roles: {
                type: 'array',
                minLength: 1,
                items: {
                    type: 'string',
                    pattern: '.+'
                }
            },
            access: {
                oneOf: [
                    {
                        type: 'string',
                        enum: ['read', 'readWrite', 'create', 'update', 'delete']
                    },
                    {
                        type: 'array',
                        items: {
                            type: 'string',
                            enum: ['read', 'readWrite', 'create', 'update', 'delete']
                        },
                        minItems: 1
                    }
                ]
            },
            restrictToAccessGroups: {
                type: 'array',
                minLength: 1,
                items: {
                    type: 'string',
                    pattern: '.+'
                }
            }
        }
    };
    refVal[2] = refVal2;
    var refVal3 = (function() {
        var pattern0 = new RegExp('^[a-zA-Z0-9]+$');
        var pattern1 = new RegExp('.+');
        var pattern2 = new RegExp('^[a-zA-Z0-9_-]+$');
        var pattern3 = new RegExp('^[a-zA-Z0-9_]+$');
        var pattern4 = new RegExp('^([a-zA-Z0-9_-]|\\.)+$');
        return function validate(data, dataPath, parentData, parentDataProperty, rootData) {
            'use strict';
            var vErrors = null;
            var errors = 0;
            if (rootData === undefined) rootData = data;
            if (data && typeof data === 'object' && !Array.isArray(data)) {
                var errs__0 = errors;
                var valid1 = true;
                for (var key0 in data) {
                    var isAdditional0 = !(false || key0 == 'types' || key0 == 'fields');
                    if (isAdditional0) {
                        valid1 = false;
                        var err = {
                            keyword: 'additionalProperties',
                            dataPath: (dataPath || '') + '',
                            schemaPath: '#/additionalProperties',
                            params: {
                                additionalProperty: '' + key0 + ''
                            },
                            message: 'should NOT have additional properties'
                        };
                        if (vErrors === null) vErrors = [err];
                        else vErrors.push(err);
                        errors++;
                    }
                }
                var data1 = data.types;
                if (data1 !== undefined) {
                    var errs_1 = errors;
                    if (data1 && typeof data1 === 'object' && !Array.isArray(data1)) {
                        var errs__1 = errors;
                        var valid2 = true;
                        for (var key1 in data1) {
                            if (pattern3.test(key1)) {
                                var errs_2 = errors;
                                if (
                                    !refVal4(
                                        data1[key1],
                                        (dataPath || '') + ".types['" + key1 + "']",
                                        data1,
                                        key1,
                                        rootData
                                    )
                                ) {
                                    if (vErrors === null) vErrors = refVal4.errors;
                                    else vErrors = vErrors.concat(refVal4.errors);
                                    errors = vErrors.length;
                                }
                                var valid2 = errors === errs_2;
                            }
                        }
                    }
                    var valid1 = errors === errs_1;
                }
                var data1 = data.fields;
                if (data1 !== undefined) {
                    var errs_1 = errors;
                    if (data1 && typeof data1 === 'object' && !Array.isArray(data1)) {
                        var errs__1 = errors;
                        var valid2 = true;
                        for (var key1 in data1) {
                            if (pattern3.test(key1)) {
                                var data2 = data1[key1];
                                var errs_2 = errors;
                                var errs__2 = errors;
                                var valid2 = false;
                                var errs_3 = errors;
                                var errs_4 = errors;
                                if (data2 && typeof data2 === 'object' && !Array.isArray(data2)) {
                                    var errs__4 = errors;
                                    var valid5 = true;
                                    if (data2.label !== undefined) {
                                        var errs_5 = errors;
                                        if (typeof data2.label !== 'string') {
                                            var err = {
                                                keyword: 'type',
                                                dataPath: (dataPath || '') + ".fields['" + key1 + "'].label",
                                                schemaPath: '#/definitions/FieldLocalization/properties/label/type',
                                                params: {
                                                    type: 'string'
                                                },
                                                message: 'should be string'
                                            };
                                            if (vErrors === null) vErrors = [err];
                                            else vErrors.push(err);
                                            errors++;
                                        }
                                        var valid5 = errors === errs_5;
                                    }
                                    if (data2.hint !== undefined) {
                                        var errs_5 = errors;
                                        if (typeof data2.hint !== 'string') {
                                            var err = {
                                                keyword: 'type',
                                                dataPath: (dataPath || '') + ".fields['" + key1 + "'].hint",
                                                schemaPath: '#/definitions/FieldLocalization/properties/hint/type',
                                                params: {
                                                    type: 'string'
                                                },
                                                message: 'should be string'
                                            };
                                            if (vErrors === null) vErrors = [err];
                                            else vErrors.push(err);
                                            errors++;
                                        }
                                        var valid5 = errors === errs_5;
                                    }
                                }
                                var valid4 = errors === errs_4;
                                var valid3 = errors === errs_3;
                                valid2 = valid2 || valid3;
                                if (!valid2) {
                                    var errs_3 = errors;
                                    if (typeof data2 !== 'string') {
                                        var err = {
                                            keyword: 'type',
                                            dataPath: (dataPath || '') + ".fields['" + key1 + "']",
                                            schemaPath:
                                                '#/properties/fields/patternProperties/%5E%5Ba-zA-Z0-9_%5D%2B%24/anyOf/1/type',
                                            params: {
                                                type: 'string'
                                            },
                                            message: 'should be string'
                                        };
                                        if (vErrors === null) vErrors = [err];
                                        else vErrors.push(err);
                                        errors++;
                                    }
                                    var valid3 = errors === errs_3;
                                    valid2 = valid2 || valid3;
                                }
                                if (!valid2) {
                                    var err = {
                                        keyword: 'anyOf',
                                        dataPath: (dataPath || '') + ".fields['" + key1 + "']",
                                        schemaPath:
                                            '#/properties/fields/patternProperties/%5E%5Ba-zA-Z0-9_%5D%2B%24/anyOf',
                                        params: {},
                                        message: 'should match some schema in anyOf'
                                    };
                                    if (vErrors === null) vErrors = [err];
                                    else vErrors.push(err);
                                    errors++;
                                } else {
                                    errors = errs__2;
                                    if (vErrors !== null) {
                                        if (errs__2) vErrors.length = errs__2;
                                        else vErrors = null;
                                    }
                                }
                                var valid2 = errors === errs_2;
                            }
                        }
                    }
                    var valid1 = errors === errs_1;
                }
            } else {
                var err = {
                    keyword: 'type',
                    dataPath: (dataPath || '') + '',
                    schemaPath: '#/type',
                    params: {
                        type: 'object'
                    },
                    message: 'should be object'
                };
                if (vErrors === null) vErrors = [err];
                else vErrors.push(err);
                errors++;
            }
            validate.errors = vErrors;
            return errors === 0;
        };
    })();
    refVal3.schema = {
        type: 'object',
        additionalProperties: false,
        properties: {
            types: {
                patternProperties: {
                    '^[a-zA-Z0-9_]+$': {
                        $ref: '#/definitions/TypeLocalization'
                    }
                }
            },
            fields: {
                patternProperties: {
                    '^[a-zA-Z0-9_]+$': {
                        anyOf: [
                            {
                                $ref: '#/definitions/FieldLocalization'
                            },
                            {
                                type: 'string'
                            }
                        ]
                    }
                }
            }
        }
    };
    refVal3.errors = null;
    refVal[3] = refVal3;
    var refVal4 = (function() {
        var pattern0 = new RegExp('^[a-zA-Z0-9]+$');
        var pattern1 = new RegExp('.+');
        var pattern2 = new RegExp('^[a-zA-Z0-9_-]+$');
        var pattern3 = new RegExp('^[a-zA-Z0-9_]+$');
        var pattern4 = new RegExp('^([a-zA-Z0-9_-]|\\.)+$');
        return function validate(data, dataPath, parentData, parentDataProperty, rootData) {
            'use strict';
            var vErrors = null;
            var errors = 0;
            if (data && typeof data === 'object' && !Array.isArray(data)) {
                var errs__0 = errors;
                var valid1 = true;
                for (var key0 in data) {
                    var isAdditional0 = !(
                        false ||
                        key0 == 'fields' ||
                        key0 == 'values' ||
                        key0 == 'label' ||
                        key0 == 'labelPlural' ||
                        key0 == 'hint'
                    );
                    if (isAdditional0) {
                        valid1 = false;
                        var err = {
                            keyword: 'additionalProperties',
                            dataPath: (dataPath || '') + '',
                            schemaPath: '#/additionalProperties',
                            params: {
                                additionalProperty: '' + key0 + ''
                            },
                            message: 'should NOT have additional properties'
                        };
                        if (vErrors === null) vErrors = [err];
                        else vErrors.push(err);
                        errors++;
                    }
                }
                var data1 = data.fields;
                if (data1 !== undefined) {
                    var errs_1 = errors;
                    if (data1 && typeof data1 === 'object' && !Array.isArray(data1)) {
                        var errs__1 = errors;
                        var valid2 = true;
                        for (var key1 in data1) {
                            if (pattern3.test(key1)) {
                                var data2 = data1[key1];
                                var errs_2 = errors;
                                var errs__2 = errors;
                                var valid2 = false;
                                var errs_3 = errors;
                                var errs_4 = errors;
                                if (data2 && typeof data2 === 'object' && !Array.isArray(data2)) {
                                    var errs__4 = errors;
                                    var valid5 = true;
                                    if (data2.label !== undefined) {
                                        var errs_5 = errors;
                                        if (typeof data2.label !== 'string') {
                                            var err = {
                                                keyword: 'type',
                                                dataPath: (dataPath || '') + ".fields['" + key1 + "'].label",
                                                schemaPath: '#/definitions/FieldLocalization/properties/label/type',
                                                params: {
                                                    type: 'string'
                                                },
                                                message: 'should be string'
                                            };
                                            if (vErrors === null) vErrors = [err];
                                            else vErrors.push(err);
                                            errors++;
                                        }
                                        var valid5 = errors === errs_5;
                                    }
                                    if (data2.hint !== undefined) {
                                        var errs_5 = errors;
                                        if (typeof data2.hint !== 'string') {
                                            var err = {
                                                keyword: 'type',
                                                dataPath: (dataPath || '') + ".fields['" + key1 + "'].hint",
                                                schemaPath: '#/definitions/FieldLocalization/properties/hint/type',
                                                params: {
                                                    type: 'string'
                                                },
                                                message: 'should be string'
                                            };
                                            if (vErrors === null) vErrors = [err];
                                            else vErrors.push(err);
                                            errors++;
                                        }
                                        var valid5 = errors === errs_5;
                                    }
                                }
                                var valid4 = errors === errs_4;
                                var valid3 = errors === errs_3;
                                valid2 = valid2 || valid3;
                                if (!valid2) {
                                    var errs_3 = errors;
                                    if (typeof data2 !== 'string') {
                                        var err = {
                                            keyword: 'type',
                                            dataPath: (dataPath || '') + ".fields['" + key1 + "']",
                                            schemaPath:
                                                '#/properties/fields/patternProperties/%5E%5Ba-zA-Z0-9_%5D%2B%24/anyOf/1/type',
                                            params: {
                                                type: 'string'
                                            },
                                            message: 'should be string'
                                        };
                                        if (vErrors === null) vErrors = [err];
                                        else vErrors.push(err);
                                        errors++;
                                    }
                                    var valid3 = errors === errs_3;
                                    valid2 = valid2 || valid3;
                                }
                                if (!valid2) {
                                    var err = {
                                        keyword: 'anyOf',
                                        dataPath: (dataPath || '') + ".fields['" + key1 + "']",
                                        schemaPath:
                                            '#/properties/fields/patternProperties/%5E%5Ba-zA-Z0-9_%5D%2B%24/anyOf',
                                        params: {},
                                        message: 'should match some schema in anyOf'
                                    };
                                    if (vErrors === null) vErrors = [err];
                                    else vErrors.push(err);
                                    errors++;
                                } else {
                                    errors = errs__2;
                                    if (vErrors !== null) {
                                        if (errs__2) vErrors.length = errs__2;
                                        else vErrors = null;
                                    }
                                }
                                var valid2 = errors === errs_2;
                            }
                        }
                    }
                    var valid1 = errors === errs_1;
                }
                var data1 = data.values;
                if (data1 !== undefined) {
                    var errs_1 = errors;
                    if (data1 && typeof data1 === 'object' && !Array.isArray(data1)) {
                        var errs__1 = errors;
                        var valid2 = true;
                        for (var key1 in data1) {
                            if (pattern3.test(key1)) {
                                var data2 = data1[key1];
                                var errs_2 = errors;
                                var errs__2 = errors;
                                var valid2 = false;
                                var errs_3 = errors;
                                var errs_4 = errors;
                                if (data2 && typeof data2 === 'object' && !Array.isArray(data2)) {
                                    var errs__4 = errors;
                                    var valid5 = true;
                                    if (data2.label !== undefined) {
                                        var errs_5 = errors;
                                        if (typeof data2.label !== 'string') {
                                            var err = {
                                                keyword: 'type',
                                                dataPath: (dataPath || '') + ".values['" + key1 + "'].label",
                                                schemaPath: '#/definitions/EnumValueLocalization/properties/label/type',
                                                params: {
                                                    type: 'string'
                                                },
                                                message: 'should be string'
                                            };
                                            if (vErrors === null) vErrors = [err];
                                            else vErrors.push(err);
                                            errors++;
                                        }
                                        var valid5 = errors === errs_5;
                                    }
                                    if (data2.hint !== undefined) {
                                        var errs_5 = errors;
                                        if (typeof data2.hint !== 'string') {
                                            var err = {
                                                keyword: 'type',
                                                dataPath: (dataPath || '') + ".values['" + key1 + "'].hint",
                                                schemaPath: '#/definitions/EnumValueLocalization/properties/hint/type',
                                                params: {
                                                    type: 'string'
                                                },
                                                message: 'should be string'
                                            };
                                            if (vErrors === null) vErrors = [err];
                                            else vErrors.push(err);
                                            errors++;
                                        }
                                        var valid5 = errors === errs_5;
                                    }
                                }
                                var valid4 = errors === errs_4;
                                var valid3 = errors === errs_3;
                                valid2 = valid2 || valid3;
                                if (!valid2) {
                                    var errs_3 = errors;
                                    if (typeof data2 !== 'string') {
                                        var err = {
                                            keyword: 'type',
                                            dataPath: (dataPath || '') + ".values['" + key1 + "']",
                                            schemaPath:
                                                '#/properties/values/patternProperties/%5E%5Ba-zA-Z0-9_%5D%2B%24/anyOf/1/type',
                                            params: {
                                                type: 'string'
                                            },
                                            message: 'should be string'
                                        };
                                        if (vErrors === null) vErrors = [err];
                                        else vErrors.push(err);
                                        errors++;
                                    }
                                    var valid3 = errors === errs_3;
                                    valid2 = valid2 || valid3;
                                }
                                if (!valid2) {
                                    var err = {
                                        keyword: 'anyOf',
                                        dataPath: (dataPath || '') + ".values['" + key1 + "']",
                                        schemaPath:
                                            '#/properties/values/patternProperties/%5E%5Ba-zA-Z0-9_%5D%2B%24/anyOf',
                                        params: {},
                                        message: 'should match some schema in anyOf'
                                    };
                                    if (vErrors === null) vErrors = [err];
                                    else vErrors.push(err);
                                    errors++;
                                } else {
                                    errors = errs__2;
                                    if (vErrors !== null) {
                                        if (errs__2) vErrors.length = errs__2;
                                        else vErrors = null;
                                    }
                                }
                                var valid2 = errors === errs_2;
                            }
                        }
                    }
                    var valid1 = errors === errs_1;
                }
                if (data.label !== undefined) {
                    var errs_1 = errors;
                    if (typeof data.label !== 'string') {
                        var err = {
                            keyword: 'type',
                            dataPath: (dataPath || '') + '.label',
                            schemaPath: '#/properties/label/type',
                            params: {
                                type: 'string'
                            },
                            message: 'should be string'
                        };
                        if (vErrors === null) vErrors = [err];
                        else vErrors.push(err);
                        errors++;
                    }
                    var valid1 = errors === errs_1;
                }
                if (data.labelPlural !== undefined) {
                    var errs_1 = errors;
                    if (typeof data.labelPlural !== 'string') {
                        var err = {
                            keyword: 'type',
                            dataPath: (dataPath || '') + '.labelPlural',
                            schemaPath: '#/properties/labelPlural/type',
                            params: {
                                type: 'string'
                            },
                            message: 'should be string'
                        };
                        if (vErrors === null) vErrors = [err];
                        else vErrors.push(err);
                        errors++;
                    }
                    var valid1 = errors === errs_1;
                }
                if (data.hint !== undefined) {
                    var errs_1 = errors;
                    if (typeof data.hint !== 'string') {
                        var err = {
                            keyword: 'type',
                            dataPath: (dataPath || '') + '.hint',
                            schemaPath: '#/properties/hint/type',
                            params: {
                                type: 'string'
                            },
                            message: 'should be string'
                        };
                        if (vErrors === null) vErrors = [err];
                        else vErrors.push(err);
                        errors++;
                    }
                    var valid1 = errors === errs_1;
                }
            } else {
                var err = {
                    keyword: 'type',
                    dataPath: (dataPath || '') + '',
                    schemaPath: '#/type',
                    params: {
                        type: 'object'
                    },
                    message: 'should be object'
                };
                if (vErrors === null) vErrors = [err];
                else vErrors.push(err);
                errors++;
            }
            validate.errors = vErrors;
            return errors === 0;
        };
    })();
    refVal4.schema = {
        type: 'object',
        additionalProperties: false,
        properties: {
            fields: {
                patternProperties: {
                    '^[a-zA-Z0-9_]+$': {
                        anyOf: [
                            {
                                $ref: '#/definitions/FieldLocalization'
                            },
                            {
                                type: 'string'
                            }
                        ]
                    }
                }
            },
            values: {
                patternProperties: {
                    '^[a-zA-Z0-9_]+$': {
                        anyOf: [
                            {
                                $ref: '#/definitions/EnumValueLocalization'
                            },
                            {
                                type: 'string'
                            }
                        ]
                    }
                }
            },
            label: {
                type: 'string'
            },
            labelPlural: {
                type: 'string'
            },
            hint: {
                type: 'string'
            }
        }
    };
    refVal4.errors = null;
    refVal[4] = refVal4;
    var refVal5 = {
        properties: {
            label: {
                type: 'string'
            },
            hint: {
                type: 'string'
            }
        }
    };
    refVal[5] = refVal5;
    var refVal6 = {
        properties: {
            label: {
                type: 'string'
            },
            hint: {
                type: 'string'
            }
        }
    };
    refVal[6] = refVal6;
    return function validate(data, dataPath, parentData, parentDataProperty, rootData) {
        'use strict';
        var vErrors = null;
        var errors = 0;
        if (rootData === undefined) rootData = data;
        if (data && typeof data === 'object' && !Array.isArray(data)) {
            if (Object.keys(data).length < 1) {
                var err = {
                    keyword: 'minProperties',
                    dataPath: (dataPath || '') + '',
                    schemaPath: '#/minProperties',
                    params: {
                        limit: 1
                    },
                    message: 'should NOT have fewer than 1 properties'
                };
                if (vErrors === null) vErrors = [err];
                else vErrors.push(err);
                errors++;
            }
            var errs__0 = errors;
            var valid1 = true;
            for (var key0 in data) {
                var isAdditional0 = !(
                    false ||
                    key0 == 'permissionProfiles' ||
                    key0 == 'i18n' ||
                    key0 == 'billing' ||
                    key0 == 'timeToLive'
                );
                if (isAdditional0) {
                    valid1 = false;
                    var err = {
                        keyword: 'additionalProperties',
                        dataPath: (dataPath || '') + '',
                        schemaPath: '#/additionalProperties',
                        params: {
                            additionalProperty: '' + key0 + ''
                        },
                        message: 'should NOT have additional properties'
                    };
                    if (vErrors === null) vErrors = [err];
                    else vErrors.push(err);
                    errors++;
                }
            }
            var data1 = data.permissionProfiles;
            if (data1 !== undefined) {
                var errs_1 = errors;
                if (data1 && typeof data1 === 'object' && !Array.isArray(data1)) {
                    var errs__1 = errors;
                    var valid2 = true;
                    for (var key1 in data1) {
                        var isAdditional1 = !(false || pattern0.test(key1));
                        if (isAdditional1) {
                            valid2 = false;
                            var err = {
                                keyword: 'additionalProperties',
                                dataPath: (dataPath || '') + '.permissionProfiles',
                                schemaPath: '#/properties/permissionProfiles/additionalProperties',
                                params: {
                                    additionalProperty: '' + key1 + ''
                                },
                                message: 'should NOT have additional properties'
                            };
                            if (vErrors === null) vErrors = [err];
                            else vErrors.push(err);
                            errors++;
                        }
                    }
                    for (var key1 in data1) {
                        if (pattern0.test(key1)) {
                            var errs_2 = errors;
                            if (
                                !refVal1(
                                    data1[key1],
                                    (dataPath || '') + ".permissionProfiles['" + key1 + "']",
                                    data1,
                                    key1,
                                    rootData
                                )
                            ) {
                                if (vErrors === null) vErrors = refVal1.errors;
                                else vErrors = vErrors.concat(refVal1.errors);
                                errors = vErrors.length;
                            }
                            var valid2 = errors === errs_2;
                        }
                    }
                } else {
                    var err = {
                        keyword: 'type',
                        dataPath: (dataPath || '') + '.permissionProfiles',
                        schemaPath: '#/properties/permissionProfiles/type',
                        params: {
                            type: 'object'
                        },
                        message: 'should be object'
                    };
                    if (vErrors === null) vErrors = [err];
                    else vErrors.push(err);
                    errors++;
                }
                var valid1 = errors === errs_1;
            }
            var data1 = data.i18n;
            if (data1 !== undefined) {
                var errs_1 = errors;
                if (data1 && typeof data1 === 'object' && !Array.isArray(data1)) {
                    var errs__1 = errors;
                    var valid2 = true;
                    for (var key1 in data1) {
                        var isAdditional1 = !(false || pattern2.test(key1));
                        if (isAdditional1) {
                            valid2 = false;
                            var err = {
                                keyword: 'additionalProperties',
                                dataPath: (dataPath || '') + '.i18n',
                                schemaPath: '#/properties/i18n/additionalProperties',
                                params: {
                                    additionalProperty: '' + key1 + ''
                                },
                                message: 'should NOT have additional properties'
                            };
                            if (vErrors === null) vErrors = [err];
                            else vErrors.push(err);
                            errors++;
                        }
                    }
                    for (var key1 in data1) {
                        if (pattern2.test(key1)) {
                            var errs_2 = errors;
                            if (
                                !refVal3(data1[key1], (dataPath || '') + ".i18n['" + key1 + "']", data1, key1, rootData)
                            ) {
                                if (vErrors === null) vErrors = refVal3.errors;
                                else vErrors = vErrors.concat(refVal3.errors);
                                errors = vErrors.length;
                            }
                            var valid2 = errors === errs_2;
                        }
                    }
                } else {
                    var err = {
                        keyword: 'type',
                        dataPath: (dataPath || '') + '.i18n',
                        schemaPath: '#/properties/i18n/type',
                        params: {
                            type: 'object'
                        },
                        message: 'should be object'
                    };
                    if (vErrors === null) vErrors = [err];
                    else vErrors.push(err);
                    errors++;
                }
                var valid1 = errors === errs_1;
            }
            var data1 = data.billing;
            if (data1 !== undefined) {
                var errs_1 = errors;
                if (data1 && typeof data1 === 'object' && !Array.isArray(data1)) {
                    var errs__1 = errors;
                    var valid2 = true;
                    for (var key1 in data1) {
                        var isAdditional1 = !(false || key1 == 'billingEntities');
                        if (isAdditional1) {
                            valid2 = false;
                            var err = {
                                keyword: 'additionalProperties',
                                dataPath: (dataPath || '') + '.billing',
                                schemaPath: '#/properties/billing/additionalProperties',
                                params: {
                                    additionalProperty: '' + key1 + ''
                                },
                                message: 'should NOT have additional properties'
                            };
                            if (vErrors === null) vErrors = [err];
                            else vErrors.push(err);
                            errors++;
                        }
                    }
                    var data2 = data1.billingEntities;
                    if (data2 !== undefined) {
                        var errs_2 = errors;
                        if (Array.isArray(data2)) {
                            var errs__2 = errors;
                            var valid2;
                            for (var i2 = 0; i2 < data2.length; i2++) {
                                var data3 = data2[i2];
                                var errs_3 = errors;
                                if (data3 && typeof data3 === 'object' && !Array.isArray(data3)) {
                                    var errs__3 = errors;
                                    var valid4 = true;
                                    for (var key3 in data3) {
                                        var isAdditional3 = !(
                                            false ||
                                            key3 == 'typeName' ||
                                            key3 == 'keyFieldName' ||
                                            key3 == 'quantityFieldName' ||
                                            key3 == 'category' ||
                                            key3 == 'categoryMapping'
                                        );
                                        if (isAdditional3) {
                                            valid4 = false;
                                            var err = {
                                                keyword: 'additionalProperties',
                                                dataPath: (dataPath || '') + '.billing.billingEntities[' + i2 + ']',
                                                schemaPath:
                                                    '#/properties/billing/properties/billingEntities/items/additionalProperties',
                                                params: {
                                                    additionalProperty: '' + key3 + ''
                                                },
                                                message: 'should NOT have additional properties'
                                            };
                                            if (vErrors === null) vErrors = [err];
                                            else vErrors.push(err);
                                            errors++;
                                        }
                                    }
                                    var data4 = data3.typeName;
                                    if (data4 === undefined) {
                                        valid4 = false;
                                        var err = {
                                            keyword: 'required',
                                            dataPath: (dataPath || '') + '.billing.billingEntities[' + i2 + ']',
                                            schemaPath:
                                                '#/properties/billing/properties/billingEntities/items/required',
                                            params: {
                                                missingProperty: 'typeName'
                                            },
                                            message: "should have required property 'typeName'"
                                        };
                                        if (vErrors === null) vErrors = [err];
                                        else vErrors.push(err);
                                        errors++;
                                    } else {
                                        var errs_4 = errors;
                                        if (typeof data4 === 'string') {
                                            if (!pattern2.test(data4)) {
                                                var err = {
                                                    keyword: 'pattern',
                                                    dataPath:
                                                        (dataPath || '') +
                                                        '.billing.billingEntities[' +
                                                        i2 +
                                                        '].typeName',
                                                    schemaPath:
                                                        '#/properties/billing/properties/billingEntities/items/properties/typeName/pattern',
                                                    params: {
                                                        pattern: '^[a-zA-Z0-9_-]+$'
                                                    },
                                                    message: 'should match pattern "^[a-zA-Z0-9_-]+$"'
                                                };
                                                if (vErrors === null) vErrors = [err];
                                                else vErrors.push(err);
                                                errors++;
                                            }
                                        } else {
                                            var err = {
                                                keyword: 'type',
                                                dataPath:
                                                    (dataPath || '') + '.billing.billingEntities[' + i2 + '].typeName',
                                                schemaPath:
                                                    '#/properties/billing/properties/billingEntities/items/properties/typeName/type',
                                                params: {
                                                    type: 'string'
                                                },
                                                message: 'should be string'
                                            };
                                            if (vErrors === null) vErrors = [err];
                                            else vErrors.push(err);
                                            errors++;
                                        }
                                        var valid4 = errors === errs_4;
                                    }
                                    var data4 = data3.keyFieldName;
                                    if (data4 !== undefined) {
                                        var errs_4 = errors;
                                        if (typeof data4 === 'string') {
                                            if (!pattern2.test(data4)) {
                                                var err = {
                                                    keyword: 'pattern',
                                                    dataPath:
                                                        (dataPath || '') +
                                                        '.billing.billingEntities[' +
                                                        i2 +
                                                        '].keyFieldName',
                                                    schemaPath:
                                                        '#/properties/billing/properties/billingEntities/items/properties/keyFieldName/pattern',
                                                    params: {
                                                        pattern: '^[a-zA-Z0-9_-]+$'
                                                    },
                                                    message: 'should match pattern "^[a-zA-Z0-9_-]+$"'
                                                };
                                                if (vErrors === null) vErrors = [err];
                                                else vErrors.push(err);
                                                errors++;
                                            }
                                        } else {
                                            var err = {
                                                keyword: 'type',
                                                dataPath:
                                                    (dataPath || '') +
                                                    '.billing.billingEntities[' +
                                                    i2 +
                                                    '].keyFieldName',
                                                schemaPath:
                                                    '#/properties/billing/properties/billingEntities/items/properties/keyFieldName/type',
                                                params: {
                                                    type: 'string'
                                                },
                                                message: 'should be string'
                                            };
                                            if (vErrors === null) vErrors = [err];
                                            else vErrors.push(err);
                                            errors++;
                                        }
                                        var valid4 = errors === errs_4;
                                    }
                                    if (data3.quantityFieldName !== undefined) {
                                        var errs_4 = errors;
                                        if (typeof data3.quantityFieldName !== 'string') {
                                            var err = {
                                                keyword: 'type',
                                                dataPath:
                                                    (dataPath || '') +
                                                    '.billing.billingEntities[' +
                                                    i2 +
                                                    '].quantityFieldName',
                                                schemaPath:
                                                    '#/properties/billing/properties/billingEntities/items/properties/quantityFieldName/type',
                                                params: {
                                                    type: 'string'
                                                },
                                                message: 'should be string'
                                            };
                                            if (vErrors === null) vErrors = [err];
                                            else vErrors.push(err);
                                            errors++;
                                        }
                                        var valid4 = errors === errs_4;
                                    }
                                    if (data3.category !== undefined) {
                                        var errs_4 = errors;
                                        if (typeof data3.category !== 'string') {
                                            var err = {
                                                keyword: 'type',
                                                dataPath:
                                                    (dataPath || '') + '.billing.billingEntities[' + i2 + '].category',
                                                schemaPath:
                                                    '#/properties/billing/properties/billingEntities/items/properties/category/type',
                                                params: {
                                                    type: 'string'
                                                },
                                                message: 'should be string'
                                            };
                                            if (vErrors === null) vErrors = [err];
                                            else vErrors.push(err);
                                            errors++;
                                        }
                                        var valid4 = errors === errs_4;
                                    }
                                    var data4 = data3.categoryMapping;
                                    if (data4 !== undefined) {
                                        var errs_4 = errors;
                                        if (data4 && typeof data4 === 'object' && !Array.isArray(data4)) {
                                            var errs__4 = errors;
                                            var valid5 = true;
                                            for (var key4 in data4) {
                                                var isAdditional4 = !(
                                                    false ||
                                                    key4 == 'fieldName' ||
                                                    key4 == 'defaultValue' ||
                                                    key4 == 'values'
                                                );
                                                if (isAdditional4) {
                                                    valid5 = false;
                                                    var err = {
                                                        keyword: 'additionalProperties',
                                                        dataPath:
                                                            (dataPath || '') +
                                                            '.billing.billingEntities[' +
                                                            i2 +
                                                            '].categoryMapping',
                                                        schemaPath:
                                                            '#/properties/billing/properties/billingEntities/items/properties/categoryMapping/additionalProperties',
                                                        params: {
                                                            additionalProperty: '' + key4 + ''
                                                        },
                                                        message: 'should NOT have additional properties'
                                                    };
                                                    if (vErrors === null) vErrors = [err];
                                                    else vErrors.push(err);
                                                    errors++;
                                                }
                                            }
                                            if (data4.fieldName === undefined) {
                                                valid5 = false;
                                                var err = {
                                                    keyword: 'required',
                                                    dataPath:
                                                        (dataPath || '') +
                                                        '.billing.billingEntities[' +
                                                        i2 +
                                                        '].categoryMapping',
                                                    schemaPath:
                                                        '#/properties/billing/properties/billingEntities/items/properties/categoryMapping/required',
                                                    params: {
                                                        missingProperty: 'fieldName'
                                                    },
                                                    message: "should have required property 'fieldName'"
                                                };
                                                if (vErrors === null) vErrors = [err];
                                                else vErrors.push(err);
                                                errors++;
                                            } else {
                                                var errs_5 = errors;
                                                if (typeof data4.fieldName !== 'string') {
                                                    var err = {
                                                        keyword: 'type',
                                                        dataPath:
                                                            (dataPath || '') +
                                                            '.billing.billingEntities[' +
                                                            i2 +
                                                            '].categoryMapping.fieldName',
                                                        schemaPath:
                                                            '#/properties/billing/properties/billingEntities/items/properties/categoryMapping/properties/fieldName/type',
                                                        params: {
                                                            type: 'string'
                                                        },
                                                        message: 'should be string'
                                                    };
                                                    if (vErrors === null) vErrors = [err];
                                                    else vErrors.push(err);
                                                    errors++;
                                                }
                                                var valid5 = errors === errs_5;
                                            }
                                            var data5 = data4.defaultValue;
                                            if (data5 === undefined) {
                                                valid5 = false;
                                                var err = {
                                                    keyword: 'required',
                                                    dataPath:
                                                        (dataPath || '') +
                                                        '.billing.billingEntities[' +
                                                        i2 +
                                                        '].categoryMapping',
                                                    schemaPath:
                                                        '#/properties/billing/properties/billingEntities/items/properties/categoryMapping/required',
                                                    params: {
                                                        missingProperty: 'defaultValue'
                                                    },
                                                    message: "should have required property 'defaultValue'"
                                                };
                                                if (vErrors === null) vErrors = [err];
                                                else vErrors.push(err);
                                                errors++;
                                            } else {
                                                var errs_5 = errors;
                                                if (typeof data5 === 'string') {
                                                    if (!pattern2.test(data5)) {
                                                        var err = {
                                                            keyword: 'pattern',
                                                            dataPath:
                                                                (dataPath || '') +
                                                                '.billing.billingEntities[' +
                                                                i2 +
                                                                '].categoryMapping.defaultValue',
                                                            schemaPath:
                                                                '#/properties/billing/properties/billingEntities/items/properties/categoryMapping/properties/defaultValue/pattern',
                                                            params: {
                                                                pattern: '^[a-zA-Z0-9_-]+$'
                                                            },
                                                            message: 'should match pattern "^[a-zA-Z0-9_-]+$"'
                                                        };
                                                        if (vErrors === null) vErrors = [err];
                                                        else vErrors.push(err);
                                                        errors++;
                                                    }
                                                } else {
                                                    var err = {
                                                        keyword: 'type',
                                                        dataPath:
                                                            (dataPath || '') +
                                                            '.billing.billingEntities[' +
                                                            i2 +
                                                            '].categoryMapping.defaultValue',
                                                        schemaPath:
                                                            '#/properties/billing/properties/billingEntities/items/properties/categoryMapping/properties/defaultValue/type',
                                                        params: {
                                                            type: 'string'
                                                        },
                                                        message: 'should be string'
                                                    };
                                                    if (vErrors === null) vErrors = [err];
                                                    else vErrors.push(err);
                                                    errors++;
                                                }
                                                var valid5 = errors === errs_5;
                                            }
                                            var data5 = data4.values;
                                            if (data5 === undefined) {
                                                valid5 = false;
                                                var err = {
                                                    keyword: 'required',
                                                    dataPath:
                                                        (dataPath || '') +
                                                        '.billing.billingEntities[' +
                                                        i2 +
                                                        '].categoryMapping',
                                                    schemaPath:
                                                        '#/properties/billing/properties/billingEntities/items/properties/categoryMapping/required',
                                                    params: {
                                                        missingProperty: 'values'
                                                    },
                                                    message: "should have required property 'values'"
                                                };
                                                if (vErrors === null) vErrors = [err];
                                                else vErrors.push(err);
                                                errors++;
                                            } else {
                                                var errs_5 = errors;
                                                if (data5 && typeof data5 === 'object' && !Array.isArray(data5)) {
                                                    var errs__5 = errors;
                                                    var valid6 = true;
                                                    for (var key5 in data5) {
                                                        var errs_6 = errors;
                                                        if (typeof data5[key5] !== 'string') {
                                                            var err = {
                                                                keyword: 'type',
                                                                dataPath:
                                                                    (dataPath || '') +
                                                                    '.billing.billingEntities[' +
                                                                    i2 +
                                                                    "].categoryMapping.values['" +
                                                                    key5 +
                                                                    "']",
                                                                schemaPath:
                                                                    '#/properties/billing/properties/billingEntities/items/properties/categoryMapping/properties/values/additionalProperties/type',
                                                                params: {
                                                                    type: 'string'
                                                                },
                                                                message: 'should be string'
                                                            };
                                                            if (vErrors === null) vErrors = [err];
                                                            else vErrors.push(err);
                                                            errors++;
                                                        }
                                                        var valid6 = errors === errs_6;
                                                    }
                                                } else {
                                                    var err = {
                                                        keyword: 'type',
                                                        dataPath:
                                                            (dataPath || '') +
                                                            '.billing.billingEntities[' +
                                                            i2 +
                                                            '].categoryMapping.values',
                                                        schemaPath:
                                                            '#/properties/billing/properties/billingEntities/items/properties/categoryMapping/properties/values/type',
                                                        params: {
                                                            type: 'object'
                                                        },
                                                        message: 'should be object'
                                                    };
                                                    if (vErrors === null) vErrors = [err];
                                                    else vErrors.push(err);
                                                    errors++;
                                                }
                                                var valid5 = errors === errs_5;
                                            }
                                        } else {
                                            var err = {
                                                keyword: 'type',
                                                dataPath:
                                                    (dataPath || '') +
                                                    '.billing.billingEntities[' +
                                                    i2 +
                                                    '].categoryMapping',
                                                schemaPath:
                                                    '#/properties/billing/properties/billingEntities/items/properties/categoryMapping/type',
                                                params: {
                                                    type: 'object'
                                                },
                                                message: 'should be object'
                                            };
                                            if (vErrors === null) vErrors = [err];
                                            else vErrors.push(err);
                                            errors++;
                                        }
                                        var valid4 = errors === errs_4;
                                    }
                                } else {
                                    var err = {
                                        keyword: 'type',
                                        dataPath: (dataPath || '') + '.billing.billingEntities[' + i2 + ']',
                                        schemaPath: '#/properties/billing/properties/billingEntities/items/type',
                                        params: {
                                            type: 'object'
                                        },
                                        message: 'should be object'
                                    };
                                    if (vErrors === null) vErrors = [err];
                                    else vErrors.push(err);
                                    errors++;
                                }
                                var valid3 = errors === errs_3;
                            }
                        } else {
                            var err = {
                                keyword: 'type',
                                dataPath: (dataPath || '') + '.billing.billingEntities',
                                schemaPath: '#/properties/billing/properties/billingEntities/type',
                                params: {
                                    type: 'array'
                                },
                                message: 'should be array'
                            };
                            if (vErrors === null) vErrors = [err];
                            else vErrors.push(err);
                            errors++;
                        }
                        var valid2 = errors === errs_2;
                    }
                } else {
                    var err = {
                        keyword: 'type',
                        dataPath: (dataPath || '') + '.billing',
                        schemaPath: '#/properties/billing/type',
                        params: {
                            type: 'object'
                        },
                        message: 'should be object'
                    };
                    if (vErrors === null) vErrors = [err];
                    else vErrors.push(err);
                    errors++;
                }
                var valid1 = errors === errs_1;
            }
            var data1 = data.timeToLive;
            if (data1 !== undefined) {
                var errs_1 = errors;
                if (Array.isArray(data1)) {
                    var errs__1 = errors;
                    var valid1;
                    for (var i1 = 0; i1 < data1.length; i1++) {
                        var data2 = data1[i1];
                        var errs_2 = errors;
                        if (data2 && typeof data2 === 'object' && !Array.isArray(data2)) {
                            if (data2.typeName === undefined) {
                                var err = {
                                    keyword: 'required',
                                    dataPath: (dataPath || '') + '.timeToLive[' + i1 + ']',
                                    schemaPath: '#/properties/timeToLive/items/required',
                                    params: {
                                        missingProperty: 'typeName'
                                    },
                                    message: "should have required property 'typeName'"
                                };
                                if (vErrors === null) vErrors = [err];
                                else vErrors.push(err);
                                errors++;
                            }
                            if (data2.dateField === undefined) {
                                var err = {
                                    keyword: 'required',
                                    dataPath: (dataPath || '') + '.timeToLive[' + i1 + ']',
                                    schemaPath: '#/properties/timeToLive/items/required',
                                    params: {
                                        missingProperty: 'dateField'
                                    },
                                    message: "should have required property 'dateField'"
                                };
                                if (vErrors === null) vErrors = [err];
                                else vErrors.push(err);
                                errors++;
                            }
                            var errs__2 = errors;
                            var valid3 = true;
                            var data3 = data2['typeName:'];
                            if (data3 !== undefined) {
                                var errs_3 = errors;
                                if (typeof data3 === 'string') {
                                    if (!pattern2.test(data3)) {
                                        var err = {
                                            keyword: 'pattern',
                                            dataPath: (dataPath || '') + '.timeToLive[' + i1 + "]['typeName:']",
                                            schemaPath: '#/properties/timeToLive/items/properties/typeName%3A/pattern',
                                            params: {
                                                pattern: '^[a-zA-Z0-9_-]+$'
                                            },
                                            message: 'should match pattern "^[a-zA-Z0-9_-]+$"'
                                        };
                                        if (vErrors === null) vErrors = [err];
                                        else vErrors.push(err);
                                        errors++;
                                    }
                                } else {
                                    var err = {
                                        keyword: 'type',
                                        dataPath: (dataPath || '') + '.timeToLive[' + i1 + "]['typeName:']",
                                        schemaPath: '#/properties/timeToLive/items/properties/typeName%3A/type',
                                        params: {
                                            type: 'string'
                                        },
                                        message: 'should be string'
                                    };
                                    if (vErrors === null) vErrors = [err];
                                    else vErrors.push(err);
                                    errors++;
                                }
                                var valid3 = errors === errs_3;
                            }
                            var data3 = data2['dateField:'];
                            if (data3 !== undefined) {
                                var errs_3 = errors;
                                if (typeof data3 === 'string') {
                                    if (!pattern4.test(data3)) {
                                        var err = {
                                            keyword: 'pattern',
                                            dataPath: (dataPath || '') + '.timeToLive[' + i1 + "]['dateField:']",
                                            schemaPath: '#/properties/timeToLive/items/properties/dateField%3A/pattern',
                                            params: {
                                                pattern: '^([a-zA-Z0-9_-]|\\.)+$'
                                            },
                                            message: 'should match pattern "^([a-zA-Z0-9_-]|\\.)+$"'
                                        };
                                        if (vErrors === null) vErrors = [err];
                                        else vErrors.push(err);
                                        errors++;
                                    }
                                } else {
                                    var err = {
                                        keyword: 'type',
                                        dataPath: (dataPath || '') + '.timeToLive[' + i1 + "]['dateField:']",
                                        schemaPath: '#/properties/timeToLive/items/properties/dateField%3A/type',
                                        params: {
                                            type: 'string'
                                        },
                                        message: 'should be string'
                                    };
                                    if (vErrors === null) vErrors = [err];
                                    else vErrors.push(err);
                                    errors++;
                                }
                                var valid3 = errors === errs_3;
                            }
                            var data3 = data2.expireAfterDays;
                            if (data3 === undefined) {
                                valid3 = false;
                                var err = {
                                    keyword: 'required',
                                    dataPath: (dataPath || '') + '.timeToLive[' + i1 + ']',
                                    schemaPath: '#/properties/timeToLive/items/required',
                                    params: {
                                        missingProperty: 'expireAfterDays'
                                    },
                                    message: "should have required property 'expireAfterDays'"
                                };
                                if (vErrors === null) vErrors = [err];
                                else vErrors.push(err);
                                errors++;
                            } else {
                                var errs_3 = errors;
                                if (typeof data3 !== 'number' || data3 % 1 || data3 !== data3) {
                                    var err = {
                                        keyword: 'type',
                                        dataPath: (dataPath || '') + '.timeToLive[' + i1 + '].expireAfterDays',
                                        schemaPath: '#/properties/timeToLive/items/properties/expireAfterDays/type',
                                        params: {
                                            type: 'integer'
                                        },
                                        message: 'should be integer'
                                    };
                                    if (vErrors === null) vErrors = [err];
                                    else vErrors.push(err);
                                    errors++;
                                }
                                if (typeof data3 === 'number') {
                                    if (data3 < 1 || data3 !== data3) {
                                        var err = {
                                            keyword: 'minimum',
                                            dataPath: (dataPath || '') + '.timeToLive[' + i1 + '].expireAfterDays',
                                            schemaPath:
                                                '#/properties/timeToLive/items/properties/expireAfterDays/minimum',
                                            params: {
                                                comparison: '>=',
                                                limit: 1,
                                                exclusive: false
                                            },
                                            message: 'should be >= 1'
                                        };
                                        if (vErrors === null) vErrors = [err];
                                        else vErrors.push(err);
                                        errors++;
                                    }
                                }
                                var valid3 = errors === errs_3;
                            }
                        } else {
                            var err = {
                                keyword: 'type',
                                dataPath: (dataPath || '') + '.timeToLive[' + i1 + ']',
                                schemaPath: '#/properties/timeToLive/items/type',
                                params: {
                                    type: 'object'
                                },
                                message: 'should be object'
                            };
                            if (vErrors === null) vErrors = [err];
                            else vErrors.push(err);
                            errors++;
                        }
                        var valid2 = errors === errs_2;
                    }
                } else {
                    var err = {
                        keyword: 'type',
                        dataPath: (dataPath || '') + '.timeToLive',
                        schemaPath: '#/properties/timeToLive/type',
                        params: {
                            type: 'array'
                        },
                        message: 'should be array'
                    };
                    if (vErrors === null) vErrors = [err];
                    else vErrors.push(err);
                    errors++;
                }
                var valid1 = errors === errs_1;
            }
        } else {
            var err = {
                keyword: 'type',
                dataPath: (dataPath || '') + '',
                schemaPath: '#/type',
                params: {
                    type: 'object'
                },
                message: 'should be object'
            };
            if (vErrors === null) vErrors = [err];
            else vErrors.push(err);
            errors++;
        }
        validate.errors = vErrors;
        return errors === 0;
    };
})();
validate.schema = {
    $schema: 'http://json-schema.org/draft-07/schema#',
    description: 'Sidecar file for schema definitions',
    type: 'object',
    minProperties: 1,
    additionalProperties: false,
    properties: {
        permissionProfiles: {
            type: 'object',
            additionalProperties: false,
            patternProperties: {
                '^[a-zA-Z0-9]+$': {
                    $ref: '#/definitions/PermissionProfile'
                }
            }
        },
        i18n: {
            type: 'object',
            additionalProperties: false,
            patternProperties: {
                '^[a-zA-Z0-9_-]+$': {
                    $ref: '#/definitions/NamespaceLocalization'
                }
            }
        },
        billing: {
            type: 'object',
            properties: {
                billingEntities: {
                    type: 'array',
                    items: {
                        type: 'object',
                        properties: {
                            typeName: {
                                type: 'string',
                                pattern: '^[a-zA-Z0-9_-]+$'
                            },
                            keyFieldName: {
                                type: 'string',
                                pattern: '^[a-zA-Z0-9_-]+$'
                            },
                            quantityFieldName: {
                                type: 'string'
                            },
                            category: {
                                type: 'string'
                            },
                            categoryMapping: {
                                type: 'object',
                                properties: {
                                    fieldName: {
                                        type: 'string'
                                    },
                                    defaultValue: {
                                        type: 'string',
                                        pattern: '^[a-zA-Z0-9_-]+$'
                                    },
                                    values: {
                                        type: 'object',
                                        additionalProperties: {
                                            type: 'string'
                                        }
                                    }
                                },
                                additionalProperties: false,
                                required: ['fieldName', 'defaultValue', 'values']
                            }
                        },
                        required: ['typeName'],
                        additionalProperties: false
                    }
                }
            },
            additionalProperties: false
        },
        timeToLive: {
            type: 'array',
            items: {
                type: 'object',
                properties: {
                    'typeName:': {
                        type: 'string',
                        pattern: '^[a-zA-Z0-9_-]+$'
                    },
                    'dateField:': {
                        type: 'string',
                        pattern: '^([a-zA-Z0-9_-]|\\.)+$'
                    },
                    expireAfterDays: {
                        type: 'integer',
                        minimum: 1
                    }
                },
                required: ['typeName', 'dateField', 'expireAfterDays']
            }
        }
    },
    definitions: {
        PermissionProfile: {
            type: 'object',
            additionalProperties: false,
            properties: {
                permissions: {
                    type: 'array',
                    items: {
                        $ref: '#/definitions/Permission'
                    }
                }
            }
        },
        Permission: {
            type: 'object',
            required: ['roles', 'access'],
            additionalProperties: false,
            properties: {
                roles: {
                    type: 'array',
                    minLength: 1,
                    items: {
                        type: 'string',
                        pattern: '.+'
                    }
                },
                access: {
                    oneOf: [
                        {
                            type: 'string',
                            enum: ['read', 'readWrite', 'create', 'update', 'delete']
                        },
                        {
                            type: 'array',
                            items: {
                                type: 'string',
                                enum: ['read', 'readWrite', 'create', 'update', 'delete']
                            },
                            minItems: 1
                        }
                    ]
                },
                restrictToAccessGroups: {
                    type: 'array',
                    minLength: 1,
                    items: {
                        type: 'string',
                        pattern: '.+'
                    }
                }
            }
        },
        NamespaceLocalization: {
            type: 'object',
            additionalProperties: false,
            properties: {
                types: {
                    patternProperties: {
                        '^[a-zA-Z0-9_]+$': {
                            $ref: '#/definitions/TypeLocalization'
                        }
                    }
                },
                fields: {
                    patternProperties: {
                        '^[a-zA-Z0-9_]+$': {
                            anyOf: [
                                {
                                    $ref: '#/definitions/FieldLocalization'
                                },
                                {
                                    type: 'string'
                                }
                            ]
                        }
                    }
                }
            }
        },
        TypeLocalization: {
            type: 'object',
            additionalProperties: false,
            properties: {
                fields: {
                    patternProperties: {
                        '^[a-zA-Z0-9_]+$': {
                            anyOf: [
                                {
                                    $ref: '#/definitions/FieldLocalization'
                                },
                                {
                                    type: 'string'
                                }
                            ]
                        }
                    }
                },
                values: {
                    patternProperties: {
                        '^[a-zA-Z0-9_]+$': {
                            anyOf: [
                                {
                                    $ref: '#/definitions/EnumValueLocalization'
                                },
                                {
                                    type: 'string'
                                }
                            ]
                        }
                    }
                },
                label: {
                    type: 'string'
                },
                labelPlural: {
                    type: 'string'
                },
                hint: {
                    type: 'string'
                }
            }
        },
        FieldLocalization: {
            properties: {
                label: {
                    type: 'string'
                },
                hint: {
                    type: 'string'
                }
            }
        },
        EnumValueLocalization: {
            properties: {
                label: {
                    type: 'string'
                },
                hint: {
                    type: 'string'
                }
            }
        }
    }
};
validate.errors = null;
module.exports = validate;
