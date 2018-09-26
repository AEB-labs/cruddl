import { ValidationContext, ValidationMessage } from '../../../src/model/validation';
import { ProjectSource } from '../../../src/project/source';
import { parseProjectSource } from '../../../src/schema/schema-builder';

export function getMessages(ps: ProjectSource): ValidationMessage[] {
    const validationContext = new ValidationContext();
    parseProjectSource(ps, validationContext);

    return validationContext.asResult().messages;
}
