import {
    SUPPRESS_COMPATIBILITY_ISSUES_ARG,
    SUPPRESS_INFOS_ARG,
    SUPPRESS_WARNINGS_ARG,
} from '../../../schema/constants';
import { Severity } from '../message';

export function getSuppressArgName(severity: Severity) {
    switch (severity) {
        case Severity.COMPATIBILITY_ISSUE:
            return SUPPRESS_COMPATIBILITY_ISSUES_ARG;
        case Severity.WARNING:
            return SUPPRESS_WARNINGS_ARG;
        case Severity.INFO:
            return SUPPRESS_INFOS_ARG;
        default:
            throw new Error(`Non-suppressable severity: ${severity}`);
    }
}
