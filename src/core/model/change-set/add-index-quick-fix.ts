import { Kind } from 'graphql';
import { INDEX_DIRECTIVE, INDICES_ARG } from '../../schema/constants.js';
import { findDirectiveWithName } from '../../schema/schema-utils.js';
import { Index } from '../implementation/indices.js';
import type { RootEntityType } from '../implementation/root-entity-type.js';
import { QuickFix } from '../validation/quick-fix.js';
import { ValidationContext } from '../validation/validation-context.js';
import { ChangeSet, TextChange } from './change-set.js';
import { createInsertionChange } from './graphql-changes.js';

export interface AddIndexQuickFixOptions {
    /**
     * Whether the index should leave out objects where one of the fields is null
     *
     * Defaults to false. A sparse index can't be used for sorting unless there also is a filter
     * that excludes null values, so only use this if the index is just needed for filtering.
     */
    readonly sparse?: boolean;
}

/**
 * Creates a quick fix that adds a (non-unique) index on the given fields of a root entity type
 *
 * If the index is on a single direct field of the root entity type, @index is added to that field.
 * Otherwise (paths into value objects, entity extensions or child entities, or multiple fields),
 * the index is added to the "indices" argument of @rootEntity.
 *
 * Returns undefined if the paths are not valid index paths, if an equivalent index already exists,
 * or if the type has not been declared in a source the quick fix could change.
 *
 * @param rootEntityType the type to add the index to
 * @param fieldPaths a dot-separated field path (e.g. "address.country"), or a list of them for a
 * multi-field index
 */
export function createAddIndexQuickFix(
    rootEntityType: RootEntityType,
    fieldPaths: string | ReadonlyArray<string>,
    { sparse = false }: AddIndexQuickFixOptions = {},
): QuickFix | undefined {
    const fields = typeof fieldPaths === 'string' ? [fieldPaths] : fieldPaths;
    const index = new Index({ fields, sparse }, rootEntityType);
    const validationContext = new ValidationContext();
    index.validate(validationContext);
    if (validationContext.asResult().hasErrors()) {
        return undefined;
    }

    const alreadyExists = rootEntityType.indices.some(
        (existing) =>
            existing.sparse === sparse &&
            existing.fields.map((f) => f.dotSeparatedPath).join(',') === fields.join(','),
    );
    if (alreadyExists) {
        return undefined;
    }

    const changes =
        getAddIndexDirectiveChanges(rootEntityType, fields, sparse) ??
        getAddToIndicesArgumentChanges(rootEntityType, fields, sparse);
    if (!changes) {
        return undefined;
    }

    return new QuickFix({
        kind: 'ADD_INDEX',
        description: `Add ${sparse ? 'sparse ' : ''}index on ${fields.map((f) => `"${f}"`).join(', ')}`,
        // indices have a cost on writes and storage, so this should be a conscious decision
        isPreferred: false,
        changeSet: new ChangeSet(changes),
    });
}

function getAddIndexDirectiveChanges(
    rootEntityType: RootEntityType,
    fields: ReadonlyArray<string>,
    sparse: boolean,
): ReadonlyArray<TextChange> | undefined {
    if (fields.length !== 1) {
        return undefined;
    }
    const field = rootEntityType.getField(fields[0]);
    const fieldNode = field?.astNode;
    if (!field || field.isSystemField || !fieldNode?.type.loc) {
        return undefined;
    }
    if (findDirectiveWithName(fieldNode, INDEX_DIRECTIVE)) {
        // there can only be one @index directive per field
        return undefined;
    }

    const lastDirective = fieldNode.directives?.[fieldNode.directives.length - 1];
    const loc = lastDirective?.loc ?? fieldNode.type.loc;
    const directive = `@${INDEX_DIRECTIVE}${sparse ? '(sparse: true)' : ''}`;
    return [createInsertionChange(loc.end, loc, ` ${directive}`)];
}

function getAddToIndicesArgumentChanges(
    rootEntityType: RootEntityType,
    fields: ReadonlyArray<string>,
    sparse: boolean,
): ReadonlyArray<TextChange> | undefined {
    const directive = rootEntityType.kindAstNode;
    if (!directive?.loc) {
        return undefined;
    }

    const fieldsText = fields.map((f) => JSON.stringify(f)).join(', ');
    const indexText = `{ fields: [${fieldsText}]${sparse ? ', sparse: true' : ''} }`;

    const indicesArgument = directive.arguments?.find((a) => a.name.value === INDICES_ARG);
    if (indicesArgument) {
        const value = indicesArgument.value;
        if (!value.loc) {
            return undefined;
        }
        if (value.kind === Kind.LIST) {
            const lastValue = value.values[value.values.length - 1];
            if (!lastValue) {
                return [new TextChange(value.loc, `[${indexText}]`)];
            }
            if (!lastValue.loc) {
                return undefined;
            }
            return [createInsertionChange(lastValue.loc.end, lastValue.loc, `, ${indexText}`)];
        }
        if (value.kind === Kind.OBJECT) {
            // a single index can be specified without a list
            return [
                createInsertionChange(value.loc.start, value.loc, '['),
                createInsertionChange(value.loc.end, value.loc, `, ${indexText}]`),
            ];
        }
        return undefined;
    }

    const lastArgument = directive.arguments?.[directive.arguments.length - 1];
    if (lastArgument) {
        if (!lastArgument.loc) {
            return undefined;
        }
        return [
            createInsertionChange(
                lastArgument.loc.end,
                lastArgument.loc,
                `, ${INDICES_ARG}: [${indexText}]`,
            ),
        ];
    }
    return [
        createInsertionChange(directive.loc.end, directive.loc, `(${INDICES_ARG}: [${indexText}])`),
    ];
}
