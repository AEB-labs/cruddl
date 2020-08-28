import { ModelValidationOptions } from '../../config/interfaces';
import { ValidationMessage } from '../validation';
import { BillingConfig } from './billing';
import { LocalizationConfig } from './i18n';
import { NamespacedPermissionProfileConfigMap, TimeToLiveConfig } from './index';
import { TypeConfig } from './type';

export interface ModelConfig {
    readonly types: ReadonlyArray<TypeConfig>;
    readonly permissionProfiles?: ReadonlyArray<NamespacedPermissionProfileConfigMap>;
    readonly validationMessages?: ReadonlyArray<ValidationMessage>;
    readonly i18n?: ReadonlyArray<LocalizationConfig>;
    readonly billing?: BillingConfig;
    readonly modelValidationOptions?: ModelValidationOptions;
}
