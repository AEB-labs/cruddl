import memorize from 'memorize-decorator';
import { locationWithinStringArgument, MessageLocation, ValidationMessage } from '../validation';
import { ModelComponent, ValidationContext } from '../validation/validation-context';
import { Field } from './field';
import { ObjectType, Type } from './type';

export interface FieldPathConfig {
    readonly path: string;
    readonly location?: MessageLocation;
    readonly baseType: ObjectType;
}

/**
 * A path to a single value
 *
 * Can be evaluated by calling createFieldNode for each segment
 */
export class FieldPath implements ModelComponent {
    readonly path: string;

    constructor(private readonly config: FieldPathConfig) {
        this.path = config.path;
    }

    @memorize()
    get fields(): ReadonlyArray<Field> | undefined {
        return this.traversePath(() => undefined);
    }

    @memorize()
    get lastField(): Field | undefined {
        return this.fields && this.fields[this.fields.length - 1];
    }

    @memorize()
    get type(): Type | undefined {
        return this.lastField ? this.lastField.type : undefined;
    }

    get isList(): boolean | undefined {
        return this.lastField ? this.lastField.isList : undefined;
    }

    validate(context: ValidationContext): void {
        this.traversePath(context.addMessage.bind(context));
    }

    private traversePath(addMessage: (mess: ValidationMessage) => void): ReadonlyArray<Field> {
        const segmentSpecifiers = this.path.split('.');
        if (!this.path || !segmentSpecifiers.length) {
            addMessage(ValidationMessage.error(`The path cannot be empty.`, this.config.location));
            return [];
        }

        let currentType: Type = this.config.baseType;
        let segments: Field[] = [];
        let currentOffset = 0;
        let lastField: Field | undefined;
        for (const segmentSpecifier of segmentSpecifiers) {
            const segmentLocation = this.config.location
                ? locationWithinStringArgument(this.config.location, currentOffset, segmentSpecifier.length)
                : undefined;

            if (!currentType.isObjectType) {
                addMessage(
                    ValidationMessage.error(
                        `Type "${currentType.name}" is not an object type and cannot be navigated into.`,
                        segmentLocation
                    )
                );
                return [];
            }
            if (lastField && lastField.isList) {
                addMessage(
                    ValidationMessage.error(
                        `Field "${lastField.declaringType.name}.${lastField.name}" is a list and cannot be navigated into.`,
                        segmentLocation
                    )
                );
                return [];
            }

            if (!segmentSpecifier) {
                addMessage(
                    ValidationMessage.error(`The path should consist of dot-separated segments.`, this.config.location)
                );
                return [];
            }
            const fieldName = segmentSpecifier;
            const field: Field | undefined = currentType.getField(fieldName);
            if (!field) {
                addMessage(
                    ValidationMessage.error(
                        `Type "${currentType.name}" does not have a field "${fieldName}".`,
                        segmentLocation
                    )
                );
                return [];
            }

            segments.push(field);
            currentType = field.type;
            currentOffset += segmentSpecifier.length + 1; // account for dot
        }

        if (!segments.length) {
            return [];
        }

        return segments;
    }
}
