import { ValidationMessage } from '../validation';
import { PermissionProfileConfigMap } from '../../model';
import { I18nConfig } from './i18n';
import { TypeConfig } from './type';

export interface ModelConfig {
    readonly types: ReadonlyArray<TypeConfig>
    readonly permissionProfiles?: PermissionProfileConfigMap
    readonly validationMessages?: ReadonlyArray<ValidationMessage>
    readonly i18n?: ReadonlyArray<I18nConfig>
}
