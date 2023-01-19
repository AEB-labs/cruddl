import memorize from 'memorize-decorator';
import {
    LocationLike,
    locationWithinStringArgument,
    MessageLocation,
    ValidationMessage,
} from '../validation';
import { ModelComponent, ValidationContext } from '../validation/validation-context';
import { Field } from './field';
import { ObjectType, Type } from './type';

export interface FieldPathConfig extends Partial<FieldPathOptions> {
    readonly path: string;
    readonly location?: LocationLike;
    readonly baseType: ObjectType;
    readonly canTraverseRootEntities?: boolean;
    readonly canFollowReferences?: boolean;
    readonly canUseCollectFields?: boolean;
    readonly canNavigateIntoLists?: boolean;
}

export interface FieldPathOptions {
    readonly canTraverseRootEntities: boolean;
    readonly canFollowReferences: boolean;
    readonly canUseCollectFields: boolean;
    readonly canNavigateIntoLists: boolean;
}

const defaultOptions: FieldPathOptions = {
    canFollowReferences: true,
    canNavigateIntoLists: false,
    canTraverseRootEntities: true,
    canUseCollectFields: true,
};

/**
 * A path to a single value
 *
 * Can be evaluated by calling createFieldNode for each segment
 */
export class FieldPath implements ModelComponent {
    readonly path: string;

    private readonly options: FieldPathOptions;

    readonly location: LocationLike | undefined;

    constructor(private readonly config: FieldPathConfig) {
        this.path = config.path;
        this.options = {
            ...defaultOptions,
            ...config,
        };
        this.location = config.location;
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

    /**
     * Gets the location for some fields within this path
     *
     * lastFieldIndex is exclusive (like with substring or slice)
     */
    getSubLocation(firstFieldIndex: number, lastFieldIndex: number): MessageLocation | undefined {
        if (!this.location || !this.fields) {
            return undefined;
        }
        const skipped = this.fields
            .slice(0, firstFieldIndex)
            .reduce((agg, field) => agg + field.name.length + 1 /* plus one for dot */, 0);
        const included = this.fields
            .slice(firstFieldIndex, lastFieldIndex)
            .reduce((agg, field) => agg + field.name.length + 1 /* plus one for dot */, 0);
        return locationWithinStringArgument(
            this.location,
            /* if we skipped any fields, also include the trailing dot of the skipped fields */
            skipped + (skipped > 0 ? 1 : 0),
            included,
        );
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
                ? locationWithinStringArgument(
                      this.config.location,
                      currentOffset,
                      segmentSpecifier.length,
                  )
                : undefined;

            if (!currentType.isObjectType) {
                addMessage(
                    ValidationMessage.error(
                        `Type "${currentType.name}" is not an object type and cannot be navigated into.`,
                        segmentLocation,
                    ),
                );
                return [];
            }
            if (lastField && lastField.isList && !this.options.canNavigateIntoLists) {
                addMessage(
                    ValidationMessage.error(
                        `Field "${lastField.declaringType.name}.${lastField.name}" is a list and cannot be navigated into.`,
                        segmentLocation,
                    ),
                );
                return [];
            }
            if (lastField && lastField.isReference && !this.options.canFollowReferences) {
                addMessage(
                    ValidationMessage.error(
                        `Field "${lastField.declaringType.name}.${lastField.name}" is a reference and cannot be navigated into.`,
                        segmentLocation,
                    ),
                );
                return [];
            }

            if (!segmentSpecifier) {
                addMessage(
                    ValidationMessage.error(
                        `The path should consist of dot-separated segments.`,
                        this.config.location,
                    ),
                );
                return [];
            }
            const fieldName = segmentSpecifier;
            const field: Field | undefined = currentType.getField(fieldName);
            if (!field) {
                addMessage(
                    ValidationMessage.error(
                        `Type "${currentType.name}" does not have a field "${fieldName}".`,
                        segmentLocation,
                    ),
                );
                return [];
            }

            // disallow them - they don't work with a simple createFieldNode call, and they don't really make sense to be used within a path.
            if (field.isParentField) {
                addMessage(
                    ValidationMessage.error(
                        `Field "${currentType.name}.${field.name}" is a parent field and cannot be used in a field path.`,
                        segmentLocation,
                    ),
                );
                return [];
            }
            if (field.isRootField) {
                addMessage(
                    ValidationMessage.error(
                        `Field "${currentType.name}.${field.name}" is a root field and cannot be used in a field path.`,
                        segmentLocation,
                    ),
                );
                return [];
            }

            if (!this.options.canUseCollectFields && field.isCollectField) {
                addMessage(
                    ValidationMessage.error(
                        `Field "${currentType.name}.${field.name}" is a collect field, but collect fields cannot be used in this path.`,
                        segmentLocation,
                    ),
                );
            }

            if (!this.options.canTraverseRootEntities) {
                if (
                    field.type.isRootEntityType ||
                    (field.isCollectField && field.collectPath?.traversesRootEntityTypes)
                ) {
                    addMessage(
                        ValidationMessage.error(
                            `Field "${currentType.name}.${field.name}" resolves to a different root entity, but this path cannot traverse root entity boundaries.`,
                            segmentLocation,
                        ),
                    );
                    return [];
                }
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
