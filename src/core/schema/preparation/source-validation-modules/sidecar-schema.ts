import { ValidationMessage } from '../../../model/validation/message.js';
import type { ParsedProjectSource } from '../../parsing/parsed-project.js';
import { ParsedProjectSourceBaseKind } from '../../parsing/parsed-project.js';
import type { ParsedSourceValidator } from '../ast-validator.js';
import validate from './schema/validate-schema.js';

const RESTRICTION_VALUE_PROPERTIES = ['value', 'valueTemplate', 'claim'];

const RESTRICTION_PATH_PATTERN =
    /^\/permissionProfiles\/[^/]+\/permissions\/\d+\/restrictions\/\d+$/;

export class SidecarSchemaValidator implements ParsedSourceValidator {
    validate(source: ParsedProjectSource): ReadonlyArray<ValidationMessage> {
        if (source.kind != ParsedProjectSourceBaseKind.OBJECT) {
            return [];
        }

        let data = source.object;

        // validate-schema.js is generated from schema.json using the npm script "compile-json-schema"
        // we pre-compile this not only for performance but mainly to conform to a CSP with eval disallowed
        if (validate(data) || !validate.errors) {
            return [];
        }

        const errors = validate.errors.filter(
            (err) =>
                // the oneOf error below covers these
                !(
                    RESTRICTION_PATH_PATTERN.test(err.instancePath) &&
                    err.keyword === 'required' &&
                    RESTRICTION_VALUE_PROPERTIES.includes(err.params.missingProperty)
                ),
        );
        return errors.map((err): ValidationMessage => {
            const path = reformatPath(err.instancePath);

            if (RESTRICTION_PATH_PATTERN.test(err.instancePath) && err.keyword === 'oneOf') {
                return ValidationMessage.error(
                    `Exactly one of "value", "valueTemplate" and "claim" must be specified in a permission restriction.`,
                    source.pathLocationMap[path],
                );
            }

            // unknown properties in restrictions were not reported previously
            if (
                RESTRICTION_PATH_PATTERN.test(err.instancePath) &&
                err.keyword === 'additionalProperties'
            ) {
                return ValidationMessage.nonSuppressableWarning(
                    `Unknown property "${err.params.additionalProperty}" in permission restriction. This will be an error in a future release.`,
                    source.pathLocationMap[path],
                );
            }

            // we allow top-level additional properties because they indicate new features, so it might be ok to omit them
            const isWarning =
                err.instancePath === '' && err.message === 'must NOT have additional properties';
            if (isWarning) {
                if (path in source.pathLocationMap) {
                    const loc = source.pathLocationMap[path];
                    return ValidationMessage.nonSuppressableWarning(err.message!, loc);
                } else {
                    return ValidationMessage.nonSuppressableWarning(
                        `${err.message} (at ${err.instancePath})`,
                        undefined,
                    );
                }
            } else {
                if (path in source.pathLocationMap) {
                    const loc = source.pathLocationMap[path];
                    return ValidationMessage.error(err.message!, loc);
                } else {
                    return ValidationMessage.error(
                        `${err.message} (at ${err.instancePath})`,
                        undefined,
                    );
                }
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
