import { ModelOptions } from '../../config/interfaces.js';
import { ValidationMessage } from '../validation/index.js';
import { BillingConfig } from './billing.js';
import { LocalizationConfig } from './i18n.js';
import { NamespacedPermissionProfileConfigMap, TimeToLiveConfig } from './index.js';
import { ModuleConfig } from './module.js';
import { TypeConfig } from './type.js';

export interface ModelConfig {
    readonly types: ReadonlyArray<TypeConfig>;
    readonly permissionProfiles?: ReadonlyArray<NamespacedPermissionProfileConfigMap>;
    readonly validationMessages?: ReadonlyArray<ValidationMessage>;
    readonly i18n?: ReadonlyArray<LocalizationConfig>;
    readonly billing?: BillingConfig;
    readonly timeToLiveConfigs?: ReadonlyArray<TimeToLiveConfig>;
    readonly options?: ModelOptions;
    readonly modules?: ReadonlyArray<ModuleConfig>;
}
