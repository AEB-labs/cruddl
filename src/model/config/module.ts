import type { MessageLocation } from '../validation/location.js';

export interface ModuleConfig {
    readonly name: string;
    readonly loc?: MessageLocation;
}
