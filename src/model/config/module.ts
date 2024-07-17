import { MessageLocation } from '../validation';

export interface ModuleConfig {
    readonly name: string;
    readonly loc?: MessageLocation;
}
