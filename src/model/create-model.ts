import { SchemaConfig } from '../config/schema-config';
import { Model } from './interfaces';
import { ValidationResult } from './validation';

export function createModel(input: SchemaConfig): Model {
    return {
        validationResult: new ValidationResult([])
    } as Model; // TODO
}
