import memorize from 'memorize-decorator';
import { GraphQLDateTime } from '../../schema/scalars/date-time';
import { GraphQLLocalDate } from '../../schema/scalars/local-date';
import { GraphQLOffsetDateTime } from '../../schema/scalars/offset-date-time';
import { RelationDeleteAction, TimeToLiveConfig, TypeKind } from '../config';
import { ValidationMessage } from '../validation';
import { ModelComponent, ValidationContext } from '../validation/validation-context';
import { Field } from './field';
import { Model } from './model';
import { RootEntityType } from './root-entity-type';
import { ScalarType } from './scalar-type';
import { Type } from './type';
import { FieldPath } from './field-path';
import { WarningCode } from '../validation/suppress/message-codes';

export class TimeToLiveType implements ModelComponent {
    readonly cascadeFields: ReadonlyArray<FieldPath> = [];

    readonly rootEntityType: RootEntityType | undefined;

    constructor(
        readonly input: TimeToLiveConfig,
        readonly model: Model,
    ) {
        this.rootEntityType = model.getRootEntityType(input.typeName);

        if (this.rootEntityType && input.cascadeFields?.length) {
            const baseType = this.rootEntityType;
            this.cascadeFields = input.cascadeFields.map(
                (path, index) =>
                    new FieldPath({
                        path,
                        baseType,
                        location: input.cascadeFieldsLocs?.[index],
                        canTraverseRootEntities: true,
                        canUseCollectFields: false,
                        canFollowReferences: false,
                        canNavigateIntoLists: true,
                    }),
            );
        }
    }

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

        this.validateCascadeFields(context);
    }

    private validateCascadeFields(context: ValidationContext) {
        const existingPaths = new Set<string>();
        for (const cascadeField of this.cascadeFields) {
            if (existingPaths.has(cascadeField.path)) {
                ValidationMessage.error(
                    `Field "${cascadeField.path}" is included multiple times`,
                    cascadeField.location,
                );
            } else {
                existingPaths.add(cascadeField.path);
                this.validateCascadeField(cascadeField, context);
            }
        }
    }

    private validateCascadeField(cascadeField: FieldPath, context: ValidationContext) {
        cascadeField.validate(context);

        if (!cascadeField.lastField || !cascadeField.fields) {
            // FieldPath has validation error
            return;
        }
        const lastFieldDesc = `"${cascadeField.lastField.declaringType.name}.${cascadeField.lastField.name}"`;

        if (!cascadeField.lastField.isRelation) {
            context.addMessage(
                ValidationMessage.error(
                    `Field ${lastFieldDesc} is not a relation and therefore cannot be configured for cascading deletion.`,
                    cascadeField.location,
                ),
            );
            return;
        }

        // ensure that all relations that are traversed *also* are cascading
        // (either because of onDelete=CASCADE or because they are included in cascadeFields)
        // in other words: ensure that no relation has been skipped
        let currentPath = '';
        let fieldCount = 0;
        for (const field of cascadeField.fields) {
            if (currentPath) {
                currentPath += '.';
            }
            currentPath += field.name;
            fieldCount++;
            if (
                field.isRelation &&
                field.relationDeleteAction !== RelationDeleteAction.CASCADE &&
                !this.cascadeFields.some((f) => f.path === currentPath)
            ) {
                context.addMessage(
                    ValidationMessage.error(
                        `Sub-path "${currentPath}" needs to be included in the cascadeFields or annotated with @relation(onDelete=CASCADE).`,
                        cascadeField.getSubLocation(0, fieldCount),
                    ),
                );
                return;
            }

            if (!field.isRelation) {
                // would only occur if there are other validation errors
                continue;
            }

            // same restriction as in model declaration
            if (field.inverseOf) {
                context.addMessage(
                    ValidationMessage.error(
                        `Field ${lastFieldDesc} is an inverse relation and cannot be used in the cascadeFields.`,
                        cascadeField.getSubLocation(0, fieldCount),
                    ),
                );
                return;
            }

            // only allow cascade on forward relations. See Field#validateRelation() for details.
            if (!field.type.isObjectType) {
                throw new Error(`Expected ${field.type.name} to be an object type`);
            }
            const inverseField = field.type.fields.find((f) => f.inverseOf === field);
            if (!inverseField) {
                context.addMessage(
                    ValidationMessage.error(
                        `cascadeFields only support 1-to-n and 1-to-1 relations. You can change ${lastFieldDesc} to a 1-to-${
                            field.isList ? 'n' : '1'
                        } relation by adding a field with the @relation(inverseOf: "${
                            field.name
                        }") directive to the target type "${field.type.name}".`,
                        cascadeField.getSubLocation(0, fieldCount),
                    ),
                );
                return;
            } else if (inverseField.isList) {
                context.addMessage(
                    ValidationMessage.error(
                        `cascadeFields only support 1-to-n and 1-to-1 relations. You can change ${lastFieldDesc} to a 1-to-${
                            field.isList ? 'n' : '1'
                        } relation by changing the type of "${field.type.name}.${
                            inverseField.name
                        }" to "${inverseField.type.name}".`,
                        cascadeField.getSubLocation(0, fieldCount),
                    ),
                );
                return;
            }
        }

        if (cascadeField.lastField.relationDeleteAction === RelationDeleteAction.CASCADE) {
            context.addMessage(
                ValidationMessage.nonSuppressableWarning(
                    `Field ${lastFieldDesc} is already annotated with @relation(onDelete=CASCADE) and listing it here does not have an effect.`,
                    cascadeField.location,
                ),
            );
        }

        // note that unlike with onDelete=CASCADE, we do not need to check for recursion
        // the reason is that here, field paths are configured instead of type fields
        // it's totally ok to e.g. include "parentHandlingUnit.parentHandlingUnit" - it would just
        // cascade two layers deep and no deeper.
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

    // TODO refactor this to use FieldPath
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
