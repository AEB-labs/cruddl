import { ParsedObjectProjectSource } from '../config/parsed-project';
import { TimeToLiveConfig } from './config';

export function parseTTLConfigs(source: ParsedObjectProjectSource): TimeToLiveConfig[] {
    if (!source.object || !source.object.timeToLive || !Array.isArray(source.object.timeToLive)) {
        return [];
    }
    const ttlConfigs = source.object.timeToLive as TimeToLiveConfig[];
    return ttlConfigs.map((ttlConfig, index) => ({
        ...ttlConfig,
        typeNameLoc: source.pathLocationMap[`/timeToLive/${index}/typeName`],
        dateFieldLoc: source.pathLocationMap[`/timeToLive/${index}/dateField`],
        expireAfterDaysLoc: source.pathLocationMap[`/timeToLive/${index}/expireAfterDays`],
    }));
}
