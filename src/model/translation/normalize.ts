import { ParsedObjectProjectSource } from '../../config/parsed-project';
import { ValidationContext } from '../validation/validation-context';
import { ModelTranslation, ModelTranslationsMap } from './types';

export function normalizeTranslationInput(translationInput: ParsedObjectProjectSource, validationContext: ValidationContext): ModelTranslationsMap {
    // TODO normalize and validate translations

    return translationInput.object as ModelTranslationsMap
}