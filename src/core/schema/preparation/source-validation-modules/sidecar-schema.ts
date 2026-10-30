import { ChangeSet, TextChange } from '../../../model/change-set/change-set.js';
import { createRemoveWholeLinesChange } from '../../../model/change-set/remove-lines.js';
import { MessageLocation } from '../../../model/validation/location.js';
import { ValidationMessage } from '../../../model/validation/message.js';
import { QuickFix } from '../../../model/validation/quick-fix.js';
import type {
    ParsedObjectProjectSource,
    ParsedProjectSource,
} from '../../parsing/parsed-project.js';
import { ParsedProjectSourceBaseKind } from '../../parsing/parsed-project.js';
import type { ParsedSourceValidator } from '../ast-validator.js';
import validate from './schema/validate-schema.js';

// e.g. "en", "de", "en-US", "zh_Hans"
const LOCALE_PATTERN = /^[a-z]{2,3}([-_][A-Za-z0-9]{2,8})*$/;

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

            if (err.keyword === 'additionalProperties') {
                const property = String(err.params.additionalProperty);
                const propertyPath = `${path}/${escapeJsonPointerSegment(property)}`;
                const loc = source.pathLocationMap[propertyPath] ?? source.pathLocationMap[path];
                // we allow top-level additional properties because they indicate new features, so it might be ok to omit them
                if (err.instancePath === '') {
                    return ValidationMessage.nonSuppressableWarning(
                        `Unknown property "${property}". It will be ignored.`,
                        loc,
                        { quickFixes: getMoveLocaleIntoI18nQuickFixes(source, property) },
                    );
                }
                return ValidationMessage.error(
                    `Unknown property "${property}"${loc ? '' : ` (at ${err.instancePath})`}.`,
                    loc,
                );
            }

            if (path in source.pathLocationMap) {
                const loc = source.pathLocationMap[path];
                return ValidationMessage.error(err.message!, loc);
            } else {
                return ValidationMessage.error(
                    `${err.message} (at ${err.instancePath})`,
                    undefined,
                );
            }
        });
    }
}

function escapeJsonPointerSegment(segment: string) {
    return segment.replace(/~/g, '~0').replace(/\//g, '~1');
}

/**
 * Offers to move a top-level property that looks like a locale (e.g. "en") into the "i18n" map, where
 * it was probably meant to be (it's easy to get the indentation wrong in YAML)
 */
function getMoveLocaleIntoI18nQuickFixes(
    source: ParsedObjectProjectSource,
    property: string,
): ReadonlyArray<QuickFix> {
    const i18n = source.object.i18n;
    if (
        !LOCALE_PATTERN.test(property) ||
        !i18n ||
        typeof i18n !== 'object' ||
        Array.isArray(i18n) ||
        property in i18n
    ) {
        return [];
    }
    const propertyLocation = source.pathLocationMap[`/${property}`];
    const i18nLocation = source.pathLocationMap['/i18n'];
    const firstLocale = Object.keys(i18n)[0];
    const firstLocaleLocation =
        firstLocale !== undefined
            ? source.pathLocationMap[`/i18n/${escapeJsonPointerSegment(firstLocale)}`]
            : undefined;
    // only supported for block-style YAML
    if (
        !propertyLocation ||
        !i18nLocation ||
        !firstLocaleLocation ||
        !/\.ya?ml$/.test(propertyLocation.source.name)
    ) {
        return [];
    }
    const body = propertyLocation.source.body;
    const firstLocaleLineStart = body.lastIndexOf('\n', firstLocaleLocation.start.offset - 1) + 1;
    const indent = body.slice(firstLocaleLineStart, firstLocaleLocation.start.offset);
    const removeChange = createRemoveWholeLinesChange(propertyLocation);
    // a "{" before the first locale means that i18n is a flow map ("i18n: { de: ... }")
    const isBlockMap = !body
        .slice(i18nLocation.start.offset, firstLocaleLocation.start.offset)
        .includes('{');
    if (!removeChange || !isBlockMap || indent === '' || indent.trim() !== '') {
        return [];
    }
    const lineBreak = body.includes('\r\n') ? '\r\n' : '\n';
    const propertyText = body.slice(propertyLocation.start.offset, propertyLocation.end.offset);
    const indentedText = propertyText
        .split(/\r?\n/)
        .map((line) => (line.trim() ? indent + line : ''))
        .join(lineBreak);
    const insertionOffset = i18nLocation.end.offset;
    const removeStart = removeChange.location.start.offset;
    const removeEnd = removeChange.location.end.offset;
    // if the property directly follows the i18n map, just indent it (and drop the blank lines in between)
    const changes =
        insertionOffset <= removeStart && body.slice(insertionOffset, removeStart).trim() === ''
            ? [
                  new TextChange(
                      new MessageLocation(propertyLocation.source, insertionOffset, removeEnd),
                      lineBreak +
                          indentedText +
                          (body.slice(0, removeEnd).endsWith('\n') ? lineBreak : ''),
                  ),
              ]
            : [
                  new TextChange(
                      new MessageLocation(
                          propertyLocation.source,
                          insertionOffset,
                          insertionOffset,
                      ),
                      lineBreak + indentedText,
                  ),
                  removeChange,
              ];
    return [
        new QuickFix({
            description: `Move into "i18n"`,
            isPreferred: true,
            changeSet: new ChangeSet(changes),
        }),
    ];
}

function reformatPath(path: string) {
    return path
        .replace(/\.(\w+)/g, (_, name) => `/${name}`)
        .replace(/\[\'([^']*)\'\]/g, (_, name) => `/${name}`)
        .replace(/\[([^\]])*\]/g, (_, name) => `/${name}`);
}
