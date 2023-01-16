import { MessageLocation } from '../validation';

export interface TimeToLiveConfig {
    readonly typeName: string;
    readonly dateField: string;
    readonly expireAfterDays: number;

    /**
     * An optional array of fields that should be treated as if it had onDelete: CASCADE set
     */
    readonly cascadeFields?: ReadonlyArray<string>;

    readonly typeNameLoc?: MessageLocation;
    readonly dateFieldLoc?: MessageLocation;
    readonly expireAfterDaysLoc?: MessageLocation;

    readonly cascadeFieldsLocs?: ReadonlyArray<MessageLocation>;
}
