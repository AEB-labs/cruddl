import {ValidationResult} from "../../../src/schema/preparation/ast-validator";
import {parse} from "graphql";
import {
    RootEntitiesWithoutReadRolesValidator,
    VALIDATION_WARNING_MISSING_ROLE_ON_ROOT_ENTITY
} from "../../../src/schema/preparation/ast-validation-modules/root-entities-without-read-roles";
import {
    NoPermissionProfileValidator, VALIDATION_ERROR_NO_PERMISSION_PROFILE
} from '../../../src/schema/preparation/ast-validation-modules/no-permission-profile';
import { DEFAULT_PERMISSION_PROFILE } from '../../../src/schema/schema-defaults';
import {
    RolesAndPermissionProfileCombinedValidator, VALIDATION_ERROR_ROLES_AND_PERMISSION_PROFILE_COMBINED
} from '../../../src/schema/preparation/ast-validation-modules/roles-and-permission-profile-combined';
import {
    UndefinedPermissionProfileValidator, VALIDATION_ERROR_ACCESS_GROUP_FIELD_MISSING,
    VALIDATION_ERROR_ACCESS_GROUP_FIELD_WRONG_TYPE,
    VALIDATION_ERROR_UNDEFINED_PERMISSION_PROFILE
} from '../../../src/schema/preparation/ast-validation-modules/undefined-permission-profile';
import { Permission, PermissionProfile } from '../../../src/authorization/permission-profile';
import {
    UndefinedTypesValidator, VALIDATION_ERROR_UNDEFINED_TYPE_REFERENCE
} from '../../../src/schema/preparation/ast-validation-modules/undefined-types';

const validSource = `
            type Test {
                other: Other
                date: DateTime
            }
            
            type Other {
                field: String
            }
        `;

const invalidSource = `
            type Test {
                other: Other2
                date: DateTime
            }
            
            type Other {
                field: String2
            }
        `;

describe('undefined-types validator', () => {
    const validator = new UndefinedTypesValidator();

    it('points out missing types', () => {
        const ast = parse(invalidSource);
        const validationResult = new ValidationResult(validator.validate(ast));
        expect(validationResult.hasErrors()).toBeTruthy();
        expect(validationResult.messages.length).toBe(2);
        expect(validationResult.messages[0].message).toBe(VALIDATION_ERROR_UNDEFINED_TYPE_REFERENCE);
        expect(validationResult.messages[1].message).toBe(VALIDATION_ERROR_UNDEFINED_TYPE_REFERENCE);
    });

    it('accepts valid sources', () => {
        const ast = parse(validSource);
        const validationResult = new ValidationResult(validator.validate(ast));
        expect(validationResult.hasErrors()).toBeFalsy();
    });
});
