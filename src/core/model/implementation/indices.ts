import type { DirectiveNode, ObjectValueNode, StringValueNode } from 'graphql';
import { Kind } from 'graphql';
import { memorize } from 'memorize-decorator';
import { SCALAR_JSON } from '../../schema/constants.js';
import { isDefined } from '../../utils/utils.js';
import type { IndexDefinitionConfig } from '../config/indices.js';
import { TypeKind } from '../config/type.js';
import { ValidationMessage } from '../validation/message.js';
import type { ModelComponent } from '../validation/validation-context.js';
import { ValidationContext } from '../validation/validation-context.js';
import { FieldPath } from './field-path.js';
import type { Field } from './field.js';
import type { RootEntityType } from './root-entity-type.js';

export class IndexField implements ModelComponent {
    readonly path: ReadonlyArray<string>;

    constructor(
        public readonly dotSeparatedPath: string,
        public readonly declaringType: RootEntityType,
        public readonly astNode?: DirectiveNode | StringValueNode | ObjectValueNode,
    ) {
        this.path = dotSeparatedPath.split('.');
    }

    /**
     * Gets the innermost field
     */
    @memorize()
    get field(): Field | undefined {
        const res = this.traversePath(() => undefined);
        return res ? res.field : undefined;
    }

    @memorize()
    get fieldsInPath(): ReadonlyArray<Field> | undefined {
        const res = this.traversePath(() => undefined);
        return res ? res.fieldsInPath : undefined;
    }

    validate(context: ValidationContext) {
        this.traversePath(context.addMessage.bind(context));
    }

    @memorize()
    private get fieldPath(): FieldPath {
        return new FieldPath({
            path: this.dotSeparatedPath,
            baseType: this.declaringType,
            // the path of a field-level index (@index or @unique) is the field itself, so there is
            // no string to point into
            location: this.astNode?.kind === Kind.STRING ? this.astNode : undefined,
            canNavigateIntoLists: true,
            canTraverseRootEntities: false,
            canFollowReferences: false,
        });
    }

    private traversePath(
        addMessage: (mess: ValidationMessage) => void,
    ): { fieldsInPath: ReadonlyArray<Field>; field: Field } | undefined {
        if (!this.dotSeparatedPath.match(/^([\w]+\.)*[\w]+$/)) {
            addMessage(
                ValidationMessage.error(
                    `An index field path should be field names separated by dots.`,
                    this.astNode,
                ),
            );
            return undefined;
        }

        const pathContext = new ValidationContext();
        this.fieldPath.validate(pathContext);
        for (const message of pathContext.validationMessages) {
            addMessage(
                message.location
                    ? message
                    : new ValidationMessage({ ...message, location: this.astNode }),
            );
        }
        if (pathContext.asResult().hasErrors()) {
            return undefined;
        }

        const fieldsInPath = this.fieldPath.fields;
        const field = fieldsInPath?.[fieldsInPath.length - 1];
        if (!fieldsInPath || !field) {
            return undefined;
        }

        if (field.type.kind !== TypeKind.SCALAR && field.type.kind !== TypeKind.ENUM) {
            addMessage(
                ValidationMessage.error(
                    `Indices can only be defined on scalar or enum fields, but the type of "${field.declaringType.name}.${field.name}" is an object type. Specify a dot-separated field path to create an index on an embedded object.`,
                    this.astNode,
                ),
            );
            return undefined;
        }

        if (field.type.kind == TypeKind.SCALAR && field.type.name == SCALAR_JSON) {
            addMessage(
                ValidationMessage.error(
                    `Indices can not be defined on scalar fields of type "JSON", but the type of "${field.declaringType.name}.${field.name}" is "JSON".`,
                    this.astNode,
                ),
            );
            return undefined;
        }

        // https://docs.arangodb.com/3.12/index-and-search/indexing/basics/#indexing-array-values
        // https://github.com/arangodb/arangodb/blob/0005e46aa971fce177833747c3f66bb182bb1c3c/lib/Basics/AttributeNameParser.cpp#L136
        const listFields = fieldsInPath.filter((f) => f.isList);
        if (listFields.length > 1) {
            const desc = listFields.map((f) => `"${f.declaringType.name}.${f.name}"`).join(', ');
            addMessage(
                ValidationMessage.error(
                    `Index paths with more than one list field are not supported by ArangoDB (list fields: ${desc}).`,
                    this.astNode,
                ),
            );
            return undefined;
        }

        return { field, fieldsInPath };
    }
}

export class Index implements ModelComponent {
    readonly name?: string;
    readonly unique: boolean;
    readonly sparse: boolean;
    readonly fields: ReadonlyArray<IndexField>;
    readonly astNode?: DirectiveNode | ObjectValueNode;
    readonly nameASTNode?: StringValueNode;

    /**
     * @deprecated has no effect, do not use
     */
    get id() {
        return undefined;
    }

    constructor(
        private input: IndexDefinitionConfig,
        public readonly declaringType: RootEntityType,
    ) {
        this.name = input.name;
        this.unique = input.unique || false;
        this.sparse = isDefined(input.sparse) ? input.sparse : this.unique;
        this.fields = (input.fields || []).map(
            (fieldPath, index) =>
                new IndexField(
                    fieldPath,
                    declaringType,
                    (input.fieldASTNodes || [])[index] || input.astNode,
                ),
        );
        this.astNode = input.astNode;
        this.nameASTNode = input.nameASTNode;
    }

    equals(other: Index) {
        if (
            this.name !== other.name ||
            this.sparse !== other.sparse ||
            this.unique !== other.unique ||
            this.fields.length !== other.fields.length
        ) {
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
            context.addMessage(
                ValidationMessage.error(`An index must specify at least one field.`, this.astNode),
            );
        }

        if (this.name && !this.name.match(/^[a-zA-Z0-9]+/)) {
            context.addMessage(
                ValidationMessage.error(
                    `An index name must only consist of alphanumeric characters.`,
                    this.nameASTNode ?? this.astNode,
                ),
            );
        }

        for (const field of this.fields) {
            field.validate(context);
        }
    }
}
