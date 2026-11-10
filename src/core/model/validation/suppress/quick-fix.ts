import type { ArgumentNode, ASTNode, DirectiveNode, EnumValueNode, ValueNode } from 'graphql';
import { Kind, print } from 'graphql';
import { SUPPRESS_DIRECTIVE } from '../../../schema/constants.js';
import { ChangeSet, TextChange } from '../../change-set/change-set.js';
import { MessageLocation } from '../location.js';
import type { AstNodeWithDirectives } from '../message.js';
import { Severity } from '../message.js';
import { QuickFix } from '../quick-fix.js';
import type { MessageCode } from './message-codes.js';
import { getSuppressArgName } from './utils.js';

/**
 * A quick fix that adds a @suppress directive (or an argument value to it) for a message
 *
 * Multiple of these fixes for the same node edit the same directive, so they cannot be applied
 * together as separate changes. Use getSuppressChangeSet() to get a combined change set for them.
 */
export class SuppressQuickFix extends QuickFix {
    constructor(
        readonly severity: Severity,
        readonly code: MessageCode,
        readonly astNode: AstNodeWithDirectives,
    ) {
        super({
            description: `Suppress this ${getMessageKind(severity)}`,
            kind: 'SUPPRESS',
            isPreferred: false,
            changeSet: () => getSuppressChangeSet(astNode, [{ severity, code }]),
        });
    }
}

export function createSuppressQuickFix(
    severity: Severity,
    code: MessageCode,
    astNode: AstNodeWithDirectives | undefined,
): QuickFix | undefined {
    if (!astNode || !astNode.loc) {
        return undefined;
    }
    return new SuppressQuickFix(severity, code, astNode);
}

function getMessageKind(severity: Severity) {
    switch (severity) {
        case Severity.WARNING:
            return 'warning';
        case Severity.INFO:
            return 'info';
        case Severity.COMPATIBILITY_ISSUE:
            return 'compatibility issue';
        default:
            return severity.toString();
    }
}

export interface SuppressEntry {
    readonly severity: Severity;
    readonly code: MessageCode;
}

/**
 * Gets the changes to suppress all the given codes on the given node
 *
 * Codes that are already suppressed are skipped, so this can generate an empty change set.
 */
export function getSuppressChangeSet(
    astNode: AstNodeWithDirectives,
    entries: ReadonlyArray<SuppressEntry>,
): ChangeSet {
    const existingDirective = astNode.directives?.find((d) => d.name.value === SUPPRESS_DIRECTIVE);

    // the codes to add, grouped by argument name, in the order of the entries
    const codesByArgName = new Map<string, MessageCode[]>();
    for (const { severity, code } of entries) {
        const argName = getSuppressArgName(severity);
        const existingCodes = getExistingCodes(existingDirective, argName);
        const codes = codesByArgName.get(argName) ?? [];
        if (!existingCodes.includes(code) && !codes.includes(code)) {
            codes.push(code);
            codesByArgName.set(argName, codes);
        }
    }
    if (!codesByArgName.size) {
        return ChangeSet.EMPTY;
    }

    if (!existingDirective?.arguments?.length) {
        const newDirectiveNode: DirectiveNode = {
            kind: Kind.DIRECTIVE,
            name: { kind: Kind.NAME, value: SUPPRESS_DIRECTIVE },
            arguments: [...codesByArgName].map(([argName, codes]) =>
                createArgumentNode(argName, codes),
            ),
        };
        const change = existingDirective
            ? // plain @suppress without any arguments - just replace the directive
              replaceNode(existingDirective, print(newDirectiveNode))
            : // append the @suppress() directive
              appendAfterNode(getNewDirectiveLocation(astNode), ' ' + print(newDirectiveNode));
        return new ChangeSet(change ? [change] : []);
    }

    const changes: TextChange[] = [];
    const newArgumentNodes: ArgumentNode[] = [];
    for (const [argName, codes] of codesByArgName) {
        const existingArg = existingDirective.arguments.find((a) => a.name.value === argName);
        if (!existingArg) {
            // @suppress() is already there but with a different argument - add our argument
            newArgumentNodes.push(createArgumentNode(argName, codes));
            continue;
        }

        let change: TextChange | undefined;
        switch (existingArg.value.kind) {
            case Kind.ENUM:
                // we need to change the single value into a list
                change = replaceNode(
                    existingArg.value,
                    print(createListValueNode([existingArg.value.value, ...codes])),
                );
                break;
            case Kind.LIST: {
                const lastValue = existingArg.value.values.at(-1);
                change = lastValue
                    ? // append ", <code>" after the last value
                      appendAfterNode(lastValue, ', ' + codes.join(', '))
                    : replaceNode(existingArg.value, print(createListValueNode(codes)));
                break;
            }
            default:
                // invalid type, nothing we can do
                break;
        }
        if (change) {
            changes.push(change);
        }
    }

    if (newArgumentNodes.length) {
        const change = appendAfterNode(
            existingDirective.arguments.at(-1),
            ', ' + newArgumentNodes.map((node) => print(node)).join(', '),
        );
        if (change) {
            changes.push(change);
        }
    }

    return new ChangeSet(changes);
}

function getExistingCodes(
    directive: DirectiveNode | undefined,
    argName: string,
): ReadonlyArray<string> {
    const value = directive?.arguments?.find((a) => a.name.value === argName)?.value;
    switch (value?.kind) {
        case Kind.ENUM:
            return [value.value];
        case Kind.LIST:
            return value.values.flatMap((v) => (v.kind === Kind.ENUM ? [v.value] : []));
        default:
            return [];
    }
}

function createArgumentNode(argName: string, codes: ReadonlyArray<string>): ArgumentNode {
    return {
        kind: Kind.ARGUMENT,
        name: { kind: Kind.NAME, value: argName },
        value: codes.length === 1 ? createEnumValueNode(codes[0]) : createListValueNode(codes),
    };
}

function createListValueNode(codes: ReadonlyArray<string>): ValueNode {
    return { kind: Kind.LIST, values: codes.map(createEnumValueNode) };
}

function createEnumValueNode(code: string): EnumValueNode {
    return { kind: Kind.ENUM, value: code };
}

/**
 * Finds the location where a new directive should be added
 *
 * @param astNode the node after which the directive should be placed, separated by a space
 */
function getNewDirectiveLocation(astNode: AstNodeWithDirectives): ASTNode | undefined {
    // if there already are directives, we can just add our directive after the last one
    const lastDirective = astNode.directives?.at(-1);
    if (lastDirective) {
        return lastDirective;
    }

    // need to figure out where directives are placed in the given definition
    switch (astNode.kind) {
        case Kind.FIELD_DEFINITION:
        case Kind.ENUM_VALUE_DEFINITION:
            // directives occur at the end of the node
            return astNode;
        case Kind.ENUM_TYPE_DEFINITION:
            // directives occur between the name and the values
            return astNode.name;
        case Kind.OBJECT_TYPE_DEFINITION:
            // directives occur between the name (or interface list, if exists) and the fields
            // we currently don't support "implements" but we might in the future
            const lastInterface = astNode.interfaces?.at(-1);
            if (lastInterface) {
                return lastInterface;
            } else {
                return astNode.name;
            }
        default:
            // the other definition types do not occur in cruddl
            return undefined;
    }
}

function appendAfterNode(astNode: ASTNode | undefined, text: string): TextChange | undefined {
    if (!astNode?.loc) {
        return undefined;
    }
    const appendAfterLocation = MessageLocation.fromGraphQLLocation(astNode.loc);
    const changeLocation = new MessageLocation(
        appendAfterLocation.source,
        appendAfterLocation.end,
        appendAfterLocation.end,
    );
    return new TextChange(changeLocation, text);
}

function replaceNode(astNode: ASTNode | undefined, text: string): TextChange | undefined {
    if (!astNode?.loc) {
        return undefined;
    }
    return new TextChange(MessageLocation.fromGraphQLLocation(astNode.loc), text);
}
