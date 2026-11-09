import type { ASTNode, ObjectFieldNode, ValueNode } from 'graphql';
import { Kind } from 'graphql';
import { ChangeSet } from '../change-set/change-set.js';
import { createRemoveListValueChange } from '../change-set/graphql-changes.js';
import { getUseSimilarNameQuickFixes } from '../change-set/similar-name-quick-fixes.js';
import { TypeKind } from '../config/type.js';
import { ValidationMessage } from '../validation/message.js';
import { QuickFix } from '../validation/quick-fix.js';
import type { Field } from './field.js';
import type { ObjectType, Type } from './type.js';

export interface ParsedDefaultValue {
    /**
     * The default value in the form that would result from parsing an equivalent GraphQL input
     * value (e.g. normalized DateTime strings, rounded decimals, ZonedDateTime instances for
     * OffsetDateTime)
     *
     * If the value does not match the field type, this is the raw value so runtime behavior does
     * not change for these models.
     */
    readonly value: unknown;

    readonly messages: ReadonlyArray<ValidationMessage>;
}

interface Problem {
    readonly message: string;
    readonly location: ASTNode | undefined;
    readonly quickFixes: ReadonlyArray<QuickFix>;
}

/**
 * Checks the @defaultValue of a field against the field's type and parses it
 *
 * Expects the field to be valid in other respects (e.g. not a relation)
 *
 * Mismatches are reported as warnings for now because they used to be accepted. They should
 * become errors in a future major version.
 */
export function parseDefaultValue(field: Field): ParsedDefaultValue {
    const rawValue = field.defaultValue;
    const directiveNode = field.defaultValueAstNode;
    const valueNode = directiveNode?.arguments?.find((a) => a.name.value === 'value')?.value;
    const parser = new DefaultValueParser();
    const value = parser.parseFieldValue(field, rawValue, valueNode, []);
    const fallbackLocation = directiveNode ?? field.astNode;
    const messages = parser.problems.map((problem) =>
        ValidationMessage.suppressableWarning(
            'INVALID_DEFAULT_VALUE',
            `${endSentence(problem.message)} This will be an error in a future release.`,
            field.astNode,
            {
                location: problem.location ?? fallbackLocation,
                quickFixes: problem.quickFixes,
            },
        ),
    );
    return {
        value: parser.problems.length ? rawValue : value,
        messages,
    };
}

class DefaultValueParser {
    readonly problems: Problem[] = [];

    parseFieldValue(
        field: Field,
        value: unknown,
        valueNode: ValueNode | undefined,
        path: ReadonlyArray<string | number>,
    ): unknown {
        // null is always allowed - it's what fields get if no value is specified
        if (value === null || value === undefined) {
            return value;
        }

        if (!field.isList) {
            return this.parseItemValue(field, value, valueNode, path);
        }

        if (!Array.isArray(value)) {
            this.addMismatch(
                `${describe(path)} must be a list because "${field.declaringType.name}.${field.name}" is a list field.`,
                valueNode,
            );
            return value;
        }
        const listNode = valueNode?.kind === Kind.LIST ? valueNode : undefined;
        return value.map((item, index) => {
            const itemNode = listNode?.values[index];
            const itemPath = [...path, index];
            if (item === null || item === undefined) {
                this.addMismatch(
                    `${describe(itemPath)} must not be null.`,
                    itemNode ?? valueNode,
                    removeListItem(itemNode),
                );
                return item;
            }
            return this.parseItemValue(field, item, itemNode, itemPath);
        });
    }

    private parseItemValue(
        field: Field,
        value: unknown,
        valueNode: ValueNode | undefined,
        path: ReadonlyArray<string | number>,
    ): unknown {
        if (field.isReference) {
            // nested in an object default value (top-level references are rejected earlier).
            // The value is the key of the referenced object.
            if (!field.type.isRootEntityType) {
                return value;
            }
            const keyField = field.type.keyField;
            if (!keyField || !keyField.type.isScalarType) {
                // there will be a different validation error
                return value;
            }
            return this.parseTypeValue(keyField.type, value, valueNode, path);
        }

        return this.parseTypeValue(field.type, value, valueNode, path);
    }

    private parseTypeValue(
        type: Type,
        value: unknown,
        valueNode: ValueNode | undefined,
        path: ReadonlyArray<string | number>,
    ): unknown {
        switch (type.kind) {
            case TypeKind.SCALAR:
                return this.parseScalarValue(
                    type.name,
                    (v) => type.graphQLScalarType.parseValue(v),
                    value,
                    valueNode,
                    path,
                );
            case TypeKind.ENUM: {
                const allowedValues = type.values.map((v) => v.value);
                if (typeof value !== 'string' || !allowedValues.includes(value)) {
                    this.addMismatch(
                        `${describe(path)} must be a value of enum "${type.name}", but is ${printValue(value)}. Valid values: ${allowedValues.join(', ')}.`,
                        valueNode,
                        typeof value === 'string' &&
                            (valueNode?.kind === Kind.ENUM || valueNode?.kind === Kind.STRING)
                            ? getUseSimilarNameQuickFixes(valueNode, value, allowedValues)
                            : [],
                    );
                }
                return value;
            }
            case TypeKind.VALUE_OBJECT:
            case TypeKind.ENTITY_EXTENSION:
            case TypeKind.CHILD_ENTITY:
                return this.parseObjectValue(type, value, valueNode, path);
            default:
                // root entities are only valid as relations / references, which are handled
                // elsewhere. Invalid types already cause a validation error.
                return value;
        }
    }

    private parseScalarValue(
        typeName: string,
        parse: (value: unknown) => unknown,
        value: unknown,
        valueNode: ValueNode | undefined,
        path: ReadonlyArray<string | number>,
    ): unknown {
        try {
            return parse(value);
        } catch (e: unknown) {
            // the reason comes from the scalar implementation (graphql-js, graphql-scalars or
            // cruddl), so its punctuation varies
            const reason = endSentence(e instanceof Error ? e.message : String(e));
            this.addMismatch(`${describe(path)} is not a valid ${typeName}: ${reason}`, valueNode);
            return value;
        }
    }

    private parseObjectValue(
        type: ObjectType,
        value: unknown,
        valueNode: ValueNode | undefined,
        path: ReadonlyArray<string | number>,
    ): unknown {
        if (typeof value !== 'object' || value === null || Array.isArray(value)) {
            this.addMismatch(
                `${describe(path)} must be an object of type "${type.name}", but is ${printValue(value)}.`,
                valueNode,
            );
            return value;
        }

        const fieldNodes = new Map<string, ObjectFieldNode>(
            valueNode?.kind === Kind.OBJECT ? valueNode.fields.map((f) => [f.name.value, f]) : [],
        );
        const result: Record<string, unknown> = {};
        for (const [key, fieldValue] of Object.entries(value)) {
            const fieldNode = fieldNodes.get(key);
            const fieldPath = [...path, key];
            const nameLocation = fieldNode?.name ?? valueNode;
            const field = type.getField(key);
            if (!field) {
                const settableFieldNames = type.fields
                    .filter((f) => !getUnsupportedReason(f) && !(f.name in value))
                    .map((f) => f.name);
                this.addMismatch(
                    `${describe(path)}: field "${key}" does not exist on type "${type.name}".`,
                    nameLocation,
                    getUseSimilarNameQuickFixes(fieldNode?.name, key, settableFieldNames),
                );
                continue;
            }
            const unsupportedReason = getUnsupportedReason(field);
            if (unsupportedReason) {
                this.addMismatch(
                    `${describe(path)}: field "${key}" cannot be set because ${unsupportedReason}.`,
                    nameLocation,
                );
                continue;
            }
            if (
                field.referenceField &&
                field.referenceField !== field &&
                field.referenceField.name in value
            ) {
                this.addMismatch(
                    `${describe(path)}: cannot set both "${key}" and "${field.referenceField.name}" because they refer to the same reference.`,
                    nameLocation,
                );
                continue;
            }
            result[key] = this.parseFieldValue(field, fieldValue, fieldNode?.value, fieldPath);
        }
        return result;
    }

    private addMismatch(
        message: string,
        location: ASTNode | undefined,
        quickFixes: ReadonlyArray<QuickFix> = [],
    ) {
        this.problems.push({ message, location, quickFixes });
    }
}

function removeListItem(itemNode: ValueNode | undefined): ReadonlyArray<QuickFix> {
    const change = itemNode && createRemoveListValueChange(itemNode);
    if (!change) {
        return [];
    }
    return [
        new QuickFix({
            description: `Remove the null value`,
            isPreferred: true,
            changeSet: new ChangeSet([change]),
        }),
    ];
}

function getUnsupportedReason(field: Field): string | undefined {
    if (field.isSystemField) {
        return 'it is a system field';
    }
    if (field.isRelation) {
        return 'it is a relation';
    }
    if (field.isCollectField) {
        return 'it is a collect field';
    }
    if (field.isParentField) {
        return 'it is a parent field';
    }
    if (field.isRootField) {
        return 'it is a root field';
    }
    return undefined;
}

/**
 * Makes sure a message ends with a sentence terminator so further sentences can be appended
 */
function endSentence(message: string): string {
    const trimmed = message.trim();
    return /[.!?]$/.test(trimmed) ? trimmed : `${trimmed}.`;
}

function describe(path: ReadonlyArray<string | number>) {
    if (!path.length) {
        return 'Default value';
    }
    const pathStr = path
        .map((segment, index) =>
            typeof segment === 'number' ? `[${segment}]` : index === 0 ? segment : `.${segment}`,
        )
        .join('');
    return `Default value at "${pathStr}"`;
}

function printValue(value: unknown): string {
    if (Array.isArray(value)) {
        return 'a list';
    }
    if (typeof value === 'object' && value !== null) {
        return 'an object';
    }
    return JSON.stringify(value);
}
