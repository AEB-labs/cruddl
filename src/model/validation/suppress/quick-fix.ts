import { ArgumentNode, ASTNode, DirectiveNode, Kind, ListValueNode, print } from 'graphql/index';
import { MessageCode } from './message-codes';
import { QuickFix } from '../quick-fix';
import { SUPPRESS_DIRECTIVE } from '../../../schema/constants';
import { MessageLocation } from '../location';
import { ChangeSet, TextChange } from '../../change-set/change-set';
import { AstNodeWithDirectives, Severity } from '../message';
import { getSuppressArgName } from './utils';

export function createSuppressQuickFix(
    severity: Severity,
    code: MessageCode,
    astNode: AstNodeWithDirectives | undefined,
): QuickFix | undefined {
    if (!astNode || !astNode.loc) {
        return undefined;
    }

    let messageKind;
    switch (severity) {
        case Severity.WARNING:
            messageKind = 'warning';
            break;
        case Severity.INFO:
            messageKind = 'info';
            break;
        case Severity.COMPATIBILITY_ISSUE:
            messageKind = 'compatibility issue';
            break;
        default:
            messageKind = severity.toString();
    }

    return new QuickFix({
        description: `Suppress this ${messageKind}`,
        isPreferred: false,

        changeSet: () => getChangeSet(severity, code, astNode),
    });
}

// can theoretically generate an empty change set, but only if
// - a loc is missing (unlikely, since we check if the astNode has a loc in createSuppressQuickFix)
// - the code is already suppressed (in which case createSuppressQuickFix() should not be called
//   in the first place)
function getChangeSet(
    severity: Severity,
    code: MessageCode,
    astNode: AstNodeWithDirectives,
): ChangeSet {
    const argName = getSuppressArgName(severity);
    const newArgumentNode: ArgumentNode = {
        kind: Kind.ARGUMENT,
        name: { kind: Kind.NAME, value: argName },
        value: { kind: Kind.ENUM, value: code },
    };
    const newDirectiveNode: DirectiveNode = {
        kind: Kind.DIRECTIVE,
        name: {
            kind: Kind.NAME,
            value: SUPPRESS_DIRECTIVE,
        },
        arguments: [newArgumentNode],
    };

    const existingDirective = astNode.directives?.find((d) => d.name.value === SUPPRESS_DIRECTIVE);
    if (!existingDirective) {
        // append the @suppress() directive
        return appendAfterNode(getNewDirectiveLocation(astNode), ' ' + print(newDirectiveNode));
    }

    if (!existingDirective.arguments?.length) {
        // plain @suppress without any arguments - just replace the directive
        return replaceNode(existingDirective, print(newDirectiveNode));
    }

    const existingArg = existingDirective.arguments?.find((d) => d.name.value === argName);
    if (!existingArg) {
        // @suppress() is already there but with a different argument - add our argument
        return appendAfterNode(existingDirective.arguments.at(-1)!, ', ' + print(newArgumentNode));
    }

    switch (existingArg.value.kind) {
        case Kind.ENUM:
            if (existingArg.value.value === code) {
                // already suppressed (should not happen)
                return ChangeSet.EMPTY;
            }

            // we need to change the single value into a list
            const newArgumentValue: ListValueNode = {
                kind: Kind.LIST,
                values: [existingArg.value, newArgumentNode.value],
            };
            return replaceNode(existingArg.value, print(newArgumentValue));

        case Kind.LIST:
            if (existingArg.value.values.some((v) => v.kind === Kind.ENUM && v.value === code)) {
                // already suppressed (should not happen)
                return ChangeSet.EMPTY;
            }

            // append ", <code>" after the last value
            return appendAfterNode(
                existingArg.value.values.at(-1)!,
                ', ' + print(newArgumentNode.value),
            );

        default:
            // invalid type
            return ChangeSet.EMPTY;
    }
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

function appendAfterNode(astNode: ASTNode | undefined, text: string): ChangeSet {
    if (!astNode?.loc) {
        return ChangeSet.EMPTY;
    }
    const appendAfterLocation = MessageLocation.fromGraphQLLocation(astNode.loc);
    const changeLocation = new MessageLocation(
        appendAfterLocation.source,
        appendAfterLocation.end,
        appendAfterLocation.end,
    );
    return new ChangeSet([new TextChange(changeLocation, text)]);
}

function replaceNode(astNode: ASTNode | undefined, text: string): ChangeSet {
    if (!astNode?.loc) {
        return ChangeSet.EMPTY;
    }
    return new ChangeSet([new TextChange(MessageLocation.fromGraphQLLocation(astNode.loc), text)]);
}
