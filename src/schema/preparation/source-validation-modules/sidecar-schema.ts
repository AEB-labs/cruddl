import { ParsedProjectSource, ParsedProjectSourceBaseKind } from '../../../config/parsed-project';
import { ValidationMessage } from '../../../model';
import { ParsedSourceValidator } from '../ast-validator';
import validate from './schema/validate-schema';

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

        return validate.errors.map((err): ValidationMessage => {
            const path = reformatPath(err.instancePath);

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
