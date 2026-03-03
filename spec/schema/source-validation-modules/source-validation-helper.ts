import type { ValidationMessage } from '../../../src/model/validation/index.js';
import { ValidationContext } from '../../../src/model/validation/index.js';
import type { ProjectSource } from '../../../src/project/source.js';
import { parseProjectSource } from '../../../src/schema/schema-builder.js';

export function getMessages(source: ProjectSource): ReadonlyArray<ValidationMessage> {
    const validationContext = new ValidationContext();
    parseProjectSource(source, {}, validationContext);

    return validationContext.asResult().messages;
}
