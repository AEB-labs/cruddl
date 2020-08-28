import { MessageLocation } from '../validation';

export interface TimeToLiveConfig {
    readonly typeName: string;
    readonly dataField: string;
    readonly expireAfterDays: number;

    readonly typeNameLoc: MessageLocation;
    readonly dataFieldLoc: MessageLocation;
    readonly expireAfterDaysLoc: MessageLocation;
}
