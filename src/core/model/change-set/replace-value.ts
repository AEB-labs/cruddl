import { escapeRegExp } from '../../utils/utils.js';
import type { MessageLocation } from '../validation/location.js';
import { TextChange } from './change-set.js';

/**
 * Creates a change that replaces a value in a JSON or YAML source
 *
 * @param location the location of the value, as found in the pathLocationMap of a parsed source. For values
 * within a YAML map, this includes the key.
 * @param key the property name if the value is a property of an object
 * @param newValue the new value (will be serialized as JSON, which is also valid YAML)
 */
export function createValueReplacementChange(
    location: MessageLocation,
    key: string | undefined,
    newValue: unknown,
): TextChange {
    const newValueText = JSON.stringify(newValue);
    const text = location.source.body.slice(location.start.offset, location.end.offset);
    // in YAML maps, the location includes the key
    if (key !== undefined && new RegExp(`^(["']?)${escapeRegExp(key)}\\1\\s*:`).test(text)) {
        return new TextChange(location, `${key}: ${newValueText}`);
    }
    return new TextChange(location, newValueText);
}
