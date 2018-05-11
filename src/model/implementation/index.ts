import { ModelInput } from '../input';
import { ValidationResult } from '../validation';

export class Model {
    constructor(input: ModelInput) {

    }

    validationResult: ValidationResult = new ValidationResult([]);
}
