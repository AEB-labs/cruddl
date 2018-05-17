import { IndexDefinitionInput, TypeKind } from '../input';
import { RootEntityType } from './root-entity-type';
import { ModelComponent, ValidationContext } from './validation';
import { Field } from './field';
import { Type } from './type';
import { ValidationMessage } from '../validation';
import {DirectiveNode, ObjectValueNode, StringValueNode} from 'graphql';

export class IndexField implements ModelComponent {
    readonly path: string[];

    constructor(public readonly dotSeparatedPath: string, public readonly declaringType: RootEntityType, public readonly astNode?: DirectiveNode | StringValueNode | ObjectValueNode) {
        this.path = dotSeparatedPath.split('.');
    }

    get field(): Field | undefined {
        return this.getField(() => undefined);
    }

    validate(context: ValidationContext) {
        this.getField(context.addMessage.bind(context));
    }

    private getField(addMessage: (mess: ValidationMessage) => void): Field | undefined {
        if (!this.dotSeparatedPath.match(/^([\w]+\.)*[\w]+$/)) {
            addMessage(ValidationMessage.error(`An index field path should be field names separated by dots.`, undefined, this.astNode));
            return undefined;
        }

        const field = this.path.reduce<[Type | undefined, Field | undefined]>(([type, field], fieldName) => {
            if (!type) {
                // we already got an error
                return [undefined, undefined];
            }

            if (!type.isObjectType) {
                if (field) {
                    addMessage(ValidationMessage.error(`Field "${field.name}" is not an object`, undefined, this.astNode));
                } else {
                    // this should not occur - would mean that the root is not an object type
                    addMessage(ValidationMessage.error(`Index defined on non-object type (this is probably an internal error).`, undefined, this.astNode));
                }
                return [undefined, undefined];
            }

            const nextField = type.getField(fieldName);
            if (!nextField) {
                addMessage(ValidationMessage.error(`Type "${type.name}" does not have a field "${fieldName}"`, undefined, this.astNode));
                return [undefined, undefined];
            }

            if (nextField.type.kind === TypeKind.ROOT_ENTITY) {
                addMessage(ValidationMessage.error(`Field "${type.name}.${nextField.name}" resolves to a root entity, but indices can not cross root entity boundaries.`, undefined, this.astNode));
                return [undefined, undefined];
            }

            return [nextField.type, nextField];
        }, [this.declaringType, undefined])[1];

        if (!field) {
            return undefined;
        }

        if (field.type.kind !== TypeKind.SCALAR && field.type.kind !== TypeKind.ENUM) {
            addMessage(ValidationMessage.error(`Indices can only be defined on scalar or enum fields, but "${field.declaringType.name}.${field.name}" is an object type. Specify a dot-separated field path to create an index on an embedded object.`, undefined, this.astNode));
            return undefined;
        }

        if (field.isList) {
            addMessage(ValidationMessage.error(`Indices can not be defined on lists, but "${field.declaringType.name}.${field.name}" has a list type.`, undefined, this.astNode));
            return undefined;
        }

        return field;
    }
}

export class Index implements ModelComponent {
    readonly id?: string;
    readonly unique: boolean;
    readonly fields: ReadonlyArray<IndexField>;
    readonly astNode?: DirectiveNode | ObjectValueNode;

    constructor(private input: IndexDefinitionInput, public readonly declaringType: RootEntityType) {
        this.id = input.id;
        this.unique = input.unique;
        this.fields = input.fields.map((fieldPath, index) => new IndexField(fieldPath, declaringType, (input.fieldASTNodes || [])[index] || this.astNode));
        this.astNode = input.astNode;
    }

    validate(context: ValidationContext) {
        for (const field of this.fields) {
            field.validate(context);
        }
    }
}
