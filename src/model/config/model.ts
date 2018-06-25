import { ValidationMessage } from '../validation';
import { PermissionProfileConfigMap } from '../../model';
import { TranslationConfig, TranslationNamespaceConfig } from './translation';
import { TypeConfig } from './type';

export interface ModelConfig {
    readonly types: ReadonlyArray<TypeConfig>
    readonly permissionProfiles?: PermissionProfileConfigMap
    readonly validationMessages?: ReadonlyArray<ValidationMessage>
    readonly translations: ReadonlyArray<TranslationConfig>
}
