import memorize from 'memorize-decorator';
import { GraphQLDateTime } from '../../schema/scalars/date-time';
import { GraphQLLocalDate } from '../../schema/scalars/local-date';
import { GraphQLOffsetDateTime } from '../../schema/scalars/offset-date-time';
import { TimeToLiveConfig, TypeKind } from '../config';
import { ValidationMessage } from '../validation';
import { ModelComponent, ValidationContext } from '../validation/validation-context';
import { Field } from './field';
import { Model } from './model';
import { RootEntityType } from './root-entity-type';
import { ScalarType } from './scalar-type';
import { Type } from './type';

export class TimeToLiveType implements ModelComponent {
    constructor(readonly input: TimeToLiveConfig, readonly model: Model) {}

    validate(context: ValidationContext): void {
        this.traversePath((mess) => context.addMessage(mess));

        if (!this.rootEntityType) {
            context.addMessage(
                ValidationMessage.error(
                    `No rootEntity with the name "${this.input.typeName}" is defined.`,
                    this.input.typeNameLoc,
                ),
            );
        }
    }

    @memorize()
    get rootEntityType(): RootEntityType | undefined {
        return this.model.getRootEntityType(this.input.typeName);
    }

    @memorize()
    get path(): ReadonlyArray<Field> | undefined {
        const traversedPath = this.traversePath(() => undefined);
        return traversedPath && traversedPath.fieldsInPath;
    }

    @memorize()
    get fieldType(): ScalarType | undefined {
        let path = this.path && this.path[this.path.length - 1];
        return path && (path.type as ScalarType);
    }

    @memorize()
    get expireAfterDays() {
        return this.input.expireAfterDays;
    }

    private traversePath(
        addMessage: (mess: ValidationMessage) => void,
    ): { fieldsInPath: ReadonlyArray<Field>; field: Field } | undefined {
        if (!this.input.dateField.match(/^([\w]+\.)*[\w]+$/)) {
            addMessage(
                ValidationMessage.error(
                    `The dateField should be a path, defined as field names separated by dots.`,
                    this.input.dateFieldLoc,
                ),
            );
            return undefined;
        }

        if (!this.rootEntityType) {
            ValidationMessage.error(
                `"${this.input.typeName}" does not specify a rootEntity.`,
                this.input.typeNameLoc,
            );
            return undefined;
        }

        let type: Type = this.rootEntityType;

        let field: Field | undefined = undefined;
        let fieldsInPath = [];
        for (const fieldName of this.input.dateField.split('.')) {
            if (!type.isObjectType) {
                if (field) {
                    addMessage(
                        ValidationMessage.error(
                            `Field "${field.name}" is not an object`,
                            this.input.dateFieldLoc,
                        ),
                    );
                } else {
                    // this should not occur - would mean that the root is not an object type
                    addMessage(
                        ValidationMessage.error(
                            `Index defined on non-object type (this is probably an internal error).`,
                            this.input.dateFieldLoc,
                        ),
                    );
                }
                return undefined;
            }

            const nextField = type.getField(fieldName);
            if (!nextField) {
                addMessage(
                    ValidationMessage.error(
                        `Type "${type.name}" does not have a field "${fieldName}"`,
                        this.input.dateFieldLoc,
                    ),
                );
                return undefined;
            }

            if (nextField.type.kind === TypeKind.ROOT_ENTITY) {
                addMessage(
                    ValidationMessage.error(
                        `Field "${type.name}.${nextField.name}" resolves to a root entity, but time-to-live-definitions can not cross root entity boundaries.`,
                        this.input.dateFieldLoc,
                    ),
                );
                return undefined;
            }

            field = nextField;
            type = nextField.type;
            fieldsInPath.push(nextField);
        }

        if (!field) {
            return undefined;
        }

        if (
            field.type &&
            !(
                field.type.name === GraphQLLocalDate.name ||
                field.type.name === GraphQLDateTime.name ||
                field.type.name === GraphQLOffsetDateTime.name
            )
        ) {
            addMessage(
                ValidationMessage.error(
                    `The dateField of time-to-live-configurations must be of type LocalDate, DateTime or OffsetDateTime.`,
                    this.input.dateFieldLoc,
                ),
            );
            return undefined;
        }

        if (field.isList) {
            addMessage(
                ValidationMessage.error(
                    `Indices can not be defined on lists, but "${field.declaringType.name}.${field.name}" has a list type.`,
                    this.input.dateFieldLoc,
                ),
            );
            return undefined;
        }

        return { field, fieldsInPath };
    }
}
