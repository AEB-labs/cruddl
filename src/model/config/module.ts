import { MessageLocation } from '../validation/index.js';

export interface ModuleConfig {
    readonly name: string;
    readonly loc?: MessageLocation;
}
