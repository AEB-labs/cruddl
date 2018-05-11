import { ValidationMessage } from '../validation';
import { PermissionProfileConfigMap } from '../../authorization/permission-profile';
import { TypeInput } from './type';

export interface ModelInput {
    types: TypeInput[]
    permissionProfiles?: PermissionProfileConfigMap
    validationMessages?: ValidationMessage[]
}
