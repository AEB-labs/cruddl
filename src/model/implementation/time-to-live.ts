import { GraphQLIncludeDirective, GraphQLInt } from 'graphql';
import memorize from 'memorize-decorator';
import { SCALAR_JSON } from '../../schema/constants';
import { GraphQLDateTime } from '../../schema/scalars/date-time';
import { TimeToLiveConfig, TypeKind } from '../config';
import { ValidationMessage } from '../validation';
import { ModelComponent, ValidationContext } from '../validation/validation-context';
import { Field } from './field';
import { Model } from './model';
import { RootEntityType } from './root-entity-type';
import { Type } from './type';

export class TimeToLiveType implements ModelComponent {
    constructor(readonly input: TimeToLiveConfig, readonly model: Model) {}

    validate(context: ValidationContext): void {
        // TODO: only one per rootEntity
        // TODO: valid expireAfterDays
    }

    @memorize()
    get rootEntityType(): RootEntityType | undefined {
        return this.model.rootEntityTypes.find(rootEntityType => rootEntityType.name === this.input.typeName);
    }

    @memorize()
    get path(): ReadonlyArray<Field> | undefined {
        const traversedPath = this.traversePath(() => undefined);
        return traversedPath && traversedPath.fieldsInPath;
    }

    @memorize()
    get expireAfterDays() {
        return this.input.expireAfterDays;
    }

    private traversePath(
        addMessage: (mess: ValidationMessage) => void
    ): { fieldsInPath: ReadonlyArray<Field>; field: Field } | undefined {
        if (!this.input.dataField.match(/^([\w]+\.)*[\w]+$/)) {
            addMessage(
                ValidationMessage.error(
                    `An index field path should be field names separated by dots.`,
                    this.input.dataFieldLoc
                )
            );
            return undefined;
        }

        if (!this.rootEntityType) {
            ValidationMessage.error(`"${this.input.typeName}" does not specify a rootEntity.`, this.input.typeNameLoc);
            return undefined;
        }

        let type: Type = this.rootEntityType;

        let field: Field | undefined = undefined;
        let fieldsInPath = [];
        for (const fieldName of this.input.dataField.split('.')) {
            if (!type.isObjectType) {
                if (field) {
                    addMessage(
                        ValidationMessage.error(`Field "${field.name}" is not an object`, this.input.dataFieldLoc)
                    );
                } else {
                    // this should not occur - would mean that the root is not an object type
                    addMessage(
                        ValidationMessage.error(
                            `Index defined on non-object type (this is probably an internal error).`,
                            this.input.dataFieldLoc
                        )
                    );
                }
                return undefined;
            }

            const nextField = type.getField(fieldName);
            if (!nextField) {
                addMessage(
                    ValidationMessage.error(
                        `Type "${type.name}" does not have a field "${fieldName}"`,
                        this.input.dataFieldLoc
                    )
                );
                return undefined;
            }

            if (nextField.type.kind === TypeKind.ROOT_ENTITY) {
                addMessage(
                    ValidationMessage.error(
                        `Field "${type.name}.${nextField.name}" resolves to a root entity, but time-to-live-definitions can not cross root entity boundaries.`,
                        this.input.dataFieldLoc
                    )
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
            field.type.kind !== TypeKind.SCALAR ||
            (field.type.name !== GraphQLDateTime.name && field.type.name !== GraphQLInt.name)
        ) {
            addMessage(
                ValidationMessage.error(
                    `Time-to-live-definitions can only be defined on DateTime or Integer fields.`,
                    this.input.dataFieldLoc
                )
            );
            return undefined;
        }

        if (field.isList) {
            addMessage(
                ValidationMessage.error(
                    `Indices can not be defined on lists, but "${field.declaringType.name}.${field.name}" has a list type.`,
                    this.input.dataFieldLoc
                )
            );
            return undefined;
        }

        return { field, fieldsInPath };
    }
}
