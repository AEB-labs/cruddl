import { ModelOptions } from '../../config/interfaces';
import { Project } from '../../project/project';
import { ValidationMessage } from '../validation';
import { BillingConfig } from './billing';
import { LocalizationConfig } from './i18n';
import { NamespacedPermissionProfileConfigMap, TimeToLiveConfig } from './index';
import { ModuleConfig } from './module';
import { TypeConfig } from './type';

export interface ModelConfig {
    readonly project?: Project
    readonly types: ReadonlyArray<TypeConfig>;
    readonly permissionProfiles?: ReadonlyArray<NamespacedPermissionProfileConfigMap>;
    readonly validationMessages?: ReadonlyArray<ValidationMessage>;
    readonly i18n?: ReadonlyArray<LocalizationConfig>;
    readonly billing?: BillingConfig;
    readonly timeToLiveConfigs?: ReadonlyArray<TimeToLiveConfig>;
    readonly options?: ModelOptions;
    readonly modules?: ReadonlyArray<ModuleConfig>;
}
