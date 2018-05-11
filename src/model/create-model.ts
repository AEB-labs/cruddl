import { SchemaConfig } from '../config/schema-config';
import { Model } from './implementation';

export function createModel(input: SchemaConfig): Model {
    return new Model({
        types: [],
        permissionProfiles: input.permissionProfiles
    });
}
