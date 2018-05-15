import { ValidationMessage } from '../validation';
import { PermissionProfileConfigMap } from '../../authorization/permission-profile';
import { TypeInput } from './type';

export interface ModelInput {
    readonly types: ReadonlyArray<TypeInput>
    readonly permissionProfiles?: PermissionProfileConfigMap
    readonly validationMessages?: ReadonlyArray<ValidationMessage>
}
