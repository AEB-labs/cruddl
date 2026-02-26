import { DirectiveNode, ObjectValueNode, StringValueNode } from 'graphql';
import memorize from 'memorize-decorator';
import { TypeKind, VectorIndexDefinitionConfig, VectorSimilarityMetric } from '../config';
import { ValidationMessage } from '../validation';
import { ModelComponent, ValidationContext } from '../validation/validation-context';
import { numberTypeNames } from './built-in-types';
import { Field } from './field';
import { FieldPath } from './field-path';
import { IndexField } from './indices';
import { RootEntityType } from './root-entity-type';

export class VectorIndexField implements ModelComponent {
    readonly path: ReadonlyArray<string>;

    private readonly indexField: IndexField;

    constructor(
        public readonly dotSeparatedPath: string,
        public readonly declaringType: RootEntityType,
        public readonly astNode?: DirectiveNode | StringValueNode | ObjectValueNode,
    ) {
        this.path = dotSeparatedPath.split('.');
        this.indexField = new IndexField(dotSeparatedPath, declaringType, astNode);
    }

    @memorize()
    get field(): Field | undefined {
        return this.indexField.field;
    }

    @memorize()
    get fieldsInPath(): ReadonlyArray<Field> | undefined {
        return this.indexField.fieldsInPath;
    }

    validate(context: ValidationContext) {
        this.indexField.validate(context);

        const field = this.field;
        if (!field) {
            return;
        }

        if (!field.isList) {
            context.addMessage(
                ValidationMessage.error(
                    `Vector indices can only be defined on list fields, but "${field.declaringType.name}.${field.name}" is not a list field.`,
                    this.astNode,
                ),
            );
        }

        if (field.type.kind !== TypeKind.SCALAR || !numberTypeNames.includes(field.type.name)) {
            context.addMessage(
                ValidationMessage.error(
                    `Vector indices can only be defined on list fields with numeric scalar items, but the type of "${field.declaringType.name}.${field.name}" is "${field.type.name}".`,
                    this.astNode,
                ),
            );
        }
    }
}

export class VectorIndex implements ModelComponent {
    readonly name?: string;
    readonly sparse: boolean;
    readonly field: VectorIndexField;
    readonly metric: VectorSimilarityMetric;
    readonly dimension?: number;
    readonly nLists?: number;
    readonly defaultNProbe?: number;
    readonly trainingIterations?: number;
    readonly factory?: string;
    readonly storedValues: ReadonlyArray<string>;
    readonly storedValueFieldPaths: ReadonlyArray<FieldPath>;
    readonly astNode?: DirectiveNode | ObjectValueNode;
    readonly nameASTNode?: StringValueNode;

    constructor(
        private input: VectorIndexDefinitionConfig,
        public readonly declaringType: RootEntityType,
    ) {
        this.name = input.name;
        this.sparse = input.sparse ?? true;
        this.field = new VectorIndexField(
            input.field,
            declaringType,
            input.fieldASTNode || input.astNode,
        );
        this.metric = input.metric ?? 'COSINE';
        this.dimension = input.dimension;
        this.nLists = input.nLists;
        this.defaultNProbe = input.defaultNProbe;
        this.trainingIterations = input.trainingIterations;
        this.factory = input.factory;
        this.storedValues = input.storedValues ?? [];
        this.storedValueFieldPaths = this.storedValues.map(
            (path, index) =>
                new FieldPath({
                    path,
                    baseType: this.declaringType,
                    location: this.input.storedValuesASTNodes?.[index] ?? input.astNode,
                    canTraverseRootEntities: false,
                    canUseCollectFields: false,
                }),
        );
        this.astNode = input.astNode;
        this.nameASTNode = input.nameASTNode;
    }

    validate(context: ValidationContext) {
        if (this.name && !this.name.match(/^[a-zA-Z0-9]+/)) {
            context.addMessage(
                ValidationMessage.error(
                    `A vector index name must only consist of alphanumeric characters.`,
                    this.nameASTNode ?? this.astNode,
                ),
            );
        }

        this.field.validate(context);

        const supportedMetrics = new Set(['COSINE', 'L2', 'INNER_PRODUCT']);
        if (!supportedMetrics.has(this.metric)) {
            context.addMessage(
                ValidationMessage.error(
                    `Unsupported vector metric "${this.metric}".`,
                    this.input.metricASTNode ?? this.astNode,
                ),
            );
        }

        if (this.dimension == undefined || this.dimension < 1) {
            context.addMessage(
                ValidationMessage.error(
                    `A vector index must specify a positive dimension.`,
                    this.input.dimensionASTNode ?? this.astNode,
                ),
            );
        }

        if (this.nLists == undefined || this.nLists < 1) {
            context.addMessage(
                ValidationMessage.error(
                    `A vector index must specify a positive nLists value.`,
                    this.input.nListsASTNode ?? this.astNode,
                ),
            );
        }

        if (this.defaultNProbe != undefined && this.defaultNProbe < 1) {
            context.addMessage(
                ValidationMessage.error(
                    `defaultNProbe must be positive if specified.`,
                    this.input.defaultNProbeASTNode ?? this.astNode,
                ),
            );
        }

        if (this.trainingIterations != undefined && this.trainingIterations < 1) {
            context.addMessage(
                ValidationMessage.error(
                    `trainingIterations must be positive if specified.`,
                    this.input.trainingIterationsASTNode ?? this.astNode,
                ),
            );
        }

        if (this.storedValues.length > 32) {
            context.addMessage(
                ValidationMessage.error(
                    `storedValues must contain at most 32 entries.`,
                    this.astNode,
                ),
            );
        }

        for (const storedValueFieldPath of this.storedValueFieldPaths) {
            storedValueFieldPath.validate(context);
        }
    }
}
