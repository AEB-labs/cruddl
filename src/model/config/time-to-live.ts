import { MessageLocation } from '../validation';

export interface TimeToLiveConfig {
    readonly typeName: string;
    readonly dateField: string;
    readonly expireAfterDays: number;

    readonly typeNameLoc: MessageLocation;
    readonly dateFieldLoc: MessageLocation;
    readonly expireAfterDaysLoc: MessageLocation;
}
