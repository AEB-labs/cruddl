import { ValidationResult } from '../model/validation';

/**
 * Thrown by a project with validation errors when certain methods are invoked (not thrown by validate())
 */
export class InvalidProjectError extends Error {
    constructor(public readonly validationResult: ValidationResult) {
        super('Project has errors:\n' + validationResult.toString());
        this.name = this.constructor.name;
    }
}
