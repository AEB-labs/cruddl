import jsonLint from 'json-lint';
import { parse as JSONparse } from 'json-source-map';
import stripJsonComments from 'strip-json-comments';
import type { ProjectOptions } from '../../config/interfaces.js';
import { MessageLocation, ValidationContext, ValidationMessage } from '../../model/index.js';
import { ProjectSource } from '../../project/source.js';
import { isReadonlyArray, type PlainObject } from '../../utils/utils.js';
import { getNamespaceFromSourceName } from './namespace-from-source-name.js';
import { type ParsedObjectProjectSource, ParsedProjectSourceBaseKind } from './parsed-project.js';

export function parseJSONSource(
    projectSource: ProjectSource,
    options: ProjectOptions,
    validationContext: ValidationContext,
): ParsedObjectProjectSource | undefined {
    if (projectSource.body.trim() === '') {
        return undefined;
    }

    // perform general JSON syntax check
    const lintResult = jsonLint(projectSource.body, { comments: true });
    if (lintResult.error) {
        let loc: MessageLocation | undefined;
        if (
            typeof lintResult.line == 'number' &&
            typeof lintResult.i == 'number' &&
            typeof lintResult.character == 'number'
        ) {
            loc = new MessageLocation(projectSource, lintResult.i, projectSource.body.length);
        }
        validationContext.addMessage(ValidationMessage.error(lintResult.error, loc));
        // returning undefined will lead to ignoring this source file in future steps
        return undefined;
    }

    // parse JSON
    const jsonPathLocationMap: { [path: string]: MessageLocation } = {};

    // whitespace: true replaces non-whitespace in comments with spaces so that the sourcemap still matches
    const bodyWithoutComments = stripJsonComments(projectSource.body, { whitespace: true });
    const parseResult = JSONparse(bodyWithoutComments);
    const pointers = parseResult.pointers;

    for (const key in pointers) {
        const pointer = pointers[key];
        jsonPathLocationMap[key] = new MessageLocation(
            projectSource,
            pointer.value.pos,
            pointer.valueEnd.pos,
        );
    }

    const data: PlainObject = parseResult.data;

    // arrays are not forbidden by json-lint
    if (isReadonlyArray(data)) {
        validationContext.addMessage(
            ValidationMessage.error(
                `JSON file should define an object (is array)`,
                new MessageLocation(projectSource, 0, projectSource.body.length),
            ),
        );
        return undefined;
    }

    return {
        kind: ParsedProjectSourceBaseKind.OBJECT,
        namespacePath:
            options.modelOptions?.useSourceDirectoriesAsNamespaces === false
                ? []
                : getNamespaceFromSourceName(projectSource.name),
        object: (data as PlainObject) || {},
        pathLocationMap: jsonPathLocationMap,
    };
}
