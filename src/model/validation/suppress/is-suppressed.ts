import { Kind } from 'graphql';
import { SUPPRESS_DIRECTIVE } from '../../../schema/constants.js';
import { AstNodeWithDirectives, Severity } from '../message.js';
import { MessageCode } from './message-codes.js';
import { getSuppressArgName } from './utils.js';

export function isSuppressed(
    severity: Severity,
    location: AstNodeWithDirectives | undefined,
    code: MessageCode,
) {
    const suppressDirective = location?.directives?.find(
        (d) => d.name.value === SUPPRESS_DIRECTIVE,
    );
    if (!suppressDirective) {
        return false;
    }
    const argName = getSuppressArgName(severity);
    const codesArg = suppressDirective?.arguments?.find((a) => a.name.value === argName);
    if (!codesArg) {
        return false;
    }
    if (codesArg.value.kind === Kind.ENUM) {
        // you can omit the [] in graphql if it's a single list entry
        return codesArg.value.value === code;
    }
    if (codesArg.value.kind !== Kind.LIST) {
        return false;
    }
    return codesArg.value.values.some((v) => v.kind === Kind.ENUM && v.value === code);
}
