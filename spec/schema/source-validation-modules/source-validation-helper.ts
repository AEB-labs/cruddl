import { ValidationContext, ValidationMessage } from '../../../src/model/validation';
import { ProjectSource } from '../../../src/project/source';
import { parseProjectSource } from '../../../src/schema/schema-builder';

export function getMessages(source: ProjectSource): ReadonlyArray<ValidationMessage> {
    const validationContext = new ValidationContext();
    parseProjectSource(source, {}, validationContext);

    return validationContext.asResult().messages;
}
