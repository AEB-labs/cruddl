import { ValidationMessage } from '../validation';
import { LocalizationConfig } from './i18n';
import { NamespacedPermissionProfileConfigMap } from './index';
import { TypeConfig } from './type';

export interface ModelConfig {
    readonly types: ReadonlyArray<TypeConfig>
    readonly permissionProfiles?: ReadonlyArray<NamespacedPermissionProfileConfigMap>
    readonly validationMessages?: ReadonlyArray<ValidationMessage>
    readonly i18n?: ReadonlyArray<LocalizationConfig>
}
