import { type DirectiveNode, type ObjectValueNode } from 'graphql';
import type { VectorIndexDefinitionConfig, VectorSimilarityMetric } from '../config/indices.js';
import { ValidationMessage } from '../validation/message.js';
import { type ModelComponent, ValidationContext } from '../validation/validation-context.js';
import { FieldPath } from './field-path.js';
import type { Field } from './field.js';

export class VectorIndex implements ModelComponent {
    readonly sparse: boolean;
    readonly metric: VectorSimilarityMetric;
    readonly dimension?: number;
    readonly nLists?: number;
    readonly defaultNProbe?: number;
    readonly maxNProbe?: number;
    readonly trainingIterations?: number;
    readonly factory?: string;
    readonly storedValues: ReadonlyArray<string>;
    readonly storedValueFieldPaths: ReadonlyArray<FieldPath>;
    readonly astNode?: DirectiveNode | ObjectValueNode;

    constructor(
        private readonly input: VectorIndexDefinitionConfig,
        public readonly field: Field,
    ) {
        this.sparse = input.sparse ?? true;
        this.metric = input.metric ?? 'COSINE';
        this.dimension = input.dimension;
        this.nLists = input.nLists;
        this.defaultNProbe = input.defaultNProbe;
        this.maxNProbe = input.maxNProbe;
        this.trainingIterations = input.trainingIterations;
        this.factory = input.factory;
        this.storedValues = input.storedValues ?? [];
        this.storedValueFieldPaths = this.storedValues.map(
            (path, index) =>
                new FieldPath({
                    path,
                    baseType: field.declaringType,
                    location: this.input.storedValuesASTNodes?.[index] ?? input.astNode,
                    canTraverseRootEntities: false,
                    canUseCollectFields: false,
                }),
        );
        this.astNode = input.astNode;
    }

    validate(context: ValidationContext) {
        // Note: list-type and Float-type validation is done in field.ts validateVectorIndex()

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

        if (this.nLists != undefined && this.nLists < 1) {
            context.addMessage(
                ValidationMessage.error(
                    `A vector index must specify a positive nLists value.`,
                    this.input.nListsASTNode ?? this.astNode,
                ),
            );
        }

        if (this.defaultNProbe == undefined || this.defaultNProbe < 1) {
            context.addMessage(
                ValidationMessage.error(
                    `A vector index must specify a positive defaultNProbe value.`,
                    this.input.defaultNProbeASTNode ?? this.astNode,
                ),
            );
        }

        if (this.maxNProbe == undefined || this.maxNProbe < 1) {
            context.addMessage(
                ValidationMessage.error(
                    `A vector index must specify a positive maxNProbe value.`,
                    this.input.maxNProbeASTNode ?? this.astNode,
                ),
            );
        }

        if (
            this.defaultNProbe != undefined &&
            this.defaultNProbe >= 1 &&
            this.maxNProbe != undefined &&
            this.maxNProbe >= 1 &&
            this.defaultNProbe > this.maxNProbe
        ) {
            context.addMessage(
                ValidationMessage.error(
                    `defaultNProbe (${this.defaultNProbe}) must not exceed maxNProbe (${this.maxNProbe}).`,
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
            return;
        }

        for (const storedValueFieldPath of this.storedValueFieldPaths) {
            storedValueFieldPath.validate(context);
        }
    }
}
