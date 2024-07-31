import { ParsedObjectProjectSource } from '../config/parsed-project';
import { isReadonlyArray } from '../utils/utils';
import { TimeToLiveConfig } from './config';

export function parseTTLConfigs(
    source: ParsedObjectProjectSource,
): ReadonlyArray<TimeToLiveConfig> {
    if (!source.object || !source.object.timeToLive || !isReadonlyArray(source.object.timeToLive)) {
        return [];
    }
    const ttlConfigs = source.object.timeToLive as ReadonlyArray<TimeToLiveConfig>;
    return ttlConfigs.map((ttlConfig, index) => ({
        ...ttlConfig,
        typeNameLoc: source.pathLocationMap[`/timeToLive/${index}/typeName`],
        dateFieldLoc: source.pathLocationMap[`/timeToLive/${index}/dateField`],
        expireAfterDaysLoc: source.pathLocationMap[`/timeToLive/${index}/expireAfterDays`],
        cascadeFieldsLocs: (ttlConfig.cascadeFields ?? []).map(
            (_, fieldIndex) =>
                source.pathLocationMap[`/timeToLive/${index}/cascadeFields/${fieldIndex}`],
        ),
    }));
}
