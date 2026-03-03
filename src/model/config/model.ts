import type { ModelOptions } from '../../config/interfaces.js';
import type { ValidationMessage } from '../validation/index.js';
import type { BillingConfig } from './billing.js';
import type { LocalizationConfig } from './i18n.js';
import type { NamespacedPermissionProfileConfigMap, TimeToLiveConfig } from './index.js';
import type { ModuleConfig } from './module.js';
import type { TypeConfig } from './type.js';

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
