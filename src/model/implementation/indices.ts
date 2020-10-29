import { IndexDefinitionConfig, TypeKind } from '../config';
import { RootEntityType } from './root-entity-type';
import { ModelComponent, ValidationContext } from '../validation/validation-context';
import { Field } from './field';
import { Type } from './type';
import { ValidationMessage } from '../validation';
import { DirectiveNode, ObjectValueNode, StringValueNode } from 'graphql';
import { SCALAR_JSON } from '../../schema/constants';

export class IndexField implements ModelComponent {
    readonly path: ReadonlyArray<string>;

    constructor(
        public readonly dotSeparatedPath: string,
        public readonly declaringType: RootEntityType,
        public readonly astNode?: DirectiveNode | StringValueNode | ObjectValueNode
    ) {
        this.path = dotSeparatedPath.split('.');
    }

    /**
     * Gets the innermost field
     */
    get field(): Field | undefined {
        const res = this.traversePath(() => undefined);
        return res ? res.field : undefined;
    }

    get fieldsInPath(): ReadonlyArray<Field> | undefined {
        const res = this.traversePath(() => undefined);
        return res ? res.fieldsInPath : undefined;
    }

    validate(context: ValidationContext) {
        this.traversePath(context.addMessage.bind(context));
    }

    private traversePath(
        addMessage: (mess: ValidationMessage) => void
    ): { fieldsInPath: ReadonlyArray<Field>; field: Field } | undefined {
        if (!this.dotSeparatedPath.match(/^([\w]+\.)*[\w]+$/)) {
            addMessage(
                ValidationMessage.error(`An index field path should be field names separated by dots.`, this.astNode)
            );
            return undefined;
        }

        let type: Type = this.declaringType;
        let field: Field | undefined = undefined;
        let fieldsInPath = [];
        for (const fieldName of this.path) {
            if (!type.isObjectType) {
                if (field) {
                    addMessage(ValidationMessage.error(`Field "${field.name}" is not an object`, this.astNode));
                } else {
                    // this should not occur - would mean that the root is not an object type
                    addMessage(
                        ValidationMessage.error(
                            `Index defined on non-object type (this is probably an internal error).`,
                            this.astNode
                        )
                    );
                }
                return undefined;
            }

            const nextField = type.getField(fieldName);
            if (!nextField) {
                addMessage(
                    ValidationMessage.error(`Type "${type.name}" does not have a field "${fieldName}"`, this.astNode)
                );
                return undefined;
            }

            if (nextField.type.kind === TypeKind.ROOT_ENTITY) {
                addMessage(
                    ValidationMessage.error(
                        `Field "${type.name}.${nextField.name}" resolves to a root entity, but indices can not cross root entity boundaries.`,
                        this.astNode
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

        if (field.type.kind !== TypeKind.SCALAR && field.type.kind !== TypeKind.ENUM) {
            addMessage(
                ValidationMessage.error(
                    `Indices can only be defined on scalar or enum fields, but the type of "${field.declaringType.name}.${field.name}" is an object type. Specify a dot-separated field path to create an index on an embedded object.`,
                    this.astNode
                )
            );
            return undefined;
        }

        if (field.type.kind == TypeKind.SCALAR && field.type.name == SCALAR_JSON) {
            addMessage(
                ValidationMessage.error(
                    `Indices can not be defined on scalar fields of type "JSON", but the type of "${field.declaringType.name}.${field.name}" is "JSON".`,
                    this.astNode
                )
            );
            return undefined;
        }

        return { field, fieldsInPath };
    }
}

export class Index implements ModelComponent {
    readonly id?: string;
    readonly unique: boolean;
    readonly sparse: boolean;
    readonly fields: ReadonlyArray<IndexField>;
    readonly astNode?: DirectiveNode | ObjectValueNode;

    constructor(private input: IndexDefinitionConfig, public readonly declaringType: RootEntityType) {
        this.id = input.id;
        this.unique = input.unique || false;
        this.sparse = input.sparse != undefined ? input.sparse : this.unique;
        this.fields = (input.fields || []).map(
            (fieldPath, index) =>
                new IndexField(fieldPath, declaringType, (input.fieldASTNodes || [])[index] || input.astNode)
        );
        this.astNode = input.astNode;
    }

    equals(other: Index) {
        if (this.id !== other.id || this.unique !== other.unique || this.fields.length !== other.fields.length) {
            return false;
        }
        for (let i = 0; i < this.fields.length; i++) {
            if (this.fields[i].dotSeparatedPath !== other.fields[i].dotSeparatedPath) {
                return false;
            }
        }
        return true;
    }

    validate(context: ValidationContext) {
        if (!this.fields.length) {
            context.addMessage(ValidationMessage.error(`An index must specify at least one field.`, this.astNode));
        }

        for (const field of this.fields) {
            field.validate(context);
        }
    }
}
