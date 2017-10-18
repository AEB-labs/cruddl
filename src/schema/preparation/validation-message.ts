import {Location} from "graphql";

export enum Severity {
    Error,
    Warning,
    Info
}

export class ValidationMessage {
    constructor(public readonly severity: Severity,
                public readonly msgKey: string,
                public readonly msgVars?: { [key: string]: string | number | boolean },
                public readonly loc?: Location) {
    }

    public static error(msgKey: string,
                        msgVars?: { [key: string]: string | number | boolean },
                        loc?: Location) {
        return new ValidationMessage(Severity.Error, msgKey, msgVars, loc);
    }

    public static warn(msgKey: string,
                       msgVars?: { [key: string]: string | number | boolean },
                       loc?: Location) {
        return new ValidationMessage(Severity.Warning, msgKey, msgVars, loc);
    }

    public static info(msgKey: string,
                       msgVars?: { [key: string]: string | number | boolean },
                       loc?: Location,) {
        return new ValidationMessage(Severity.Info, msgKey, msgVars, loc);
    }

    public toString() {
        return JSON.stringify(this);
    }

}
