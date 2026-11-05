import { type DirectiveNode, type ObjectValueNode } from 'graphql';
import { VECTOR_INDEX_N_LISTS_ARG } from '../../schema/constants.js';
import { ChangeSet, TextChange } from '../change-set/change-set.js';
import {
    createInsertionChange,
    createRemoveListValueChange,
} from '../change-set/graphql-changes.js';
import type { VectorIndexDefinitionConfig, VectorSimilarityMetric } from '../config/indices.js';
import { ValidationMessage } from '../validation/message.js';
import { QuickFix } from '../validation/quick-fix.js';
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

        this.validateFactory(context);

        if (this.storedValues.length > 32) {
            context.addMessage(
                ValidationMessage.error(
                    `storedValues must contain at most 32 entries.`,
                    this.astNode,
                ),
            );
            return;
        }

        const seenStoredValues = new Set<string>();
        for (const [index, storedValueFieldPath] of this.storedValueFieldPaths.entries()) {
            if (seenStoredValues.has(storedValueFieldPath.path)) {
                // ArangoDB rejects the index definition
                const astNode = this.input.storedValuesASTNodes?.[index];
                const change = astNode && createRemoveListValueChange(astNode);
                context.addMessage(
                    ValidationMessage.error(
                        `"${storedValueFieldPath.path}" is included multiple times in storedValues.`,
                        astNode ?? this.astNode,
                        {
                            quickFixes: change
                                ? [
                                      new QuickFix({
                                          description: 'Remove duplicate',
                                          isPreferred: true,
                                          changeSet: new ChangeSet([change]),
                                      }),
                                  ]
                                : [],
                        },
                    ),
                );
                continue;
            }
            seenStoredValues.add(storedValueFieldPath.path);
            storedValueFieldPath.validate(context);
        }
    }

    private validateFactory(context: ValidationContext) {
        if (this.factory == undefined) {
            return;
        }
        // ArangoDB only supports IVF indices, and faiss needs an encoding after the IVF part
        // (e.g. "IVF100,Flat" or "IVF100_HNSW32,PQ16")
        const match = /^IVF(\d+)(?:_[^,]*)?,./.exec(this.factory);
        if (!match) {
            context.addMessage(
                ValidationMessage.error(
                    `The factory "${this.factory}" is not supported. It needs to start with an IVF index and specify an encoding, e.g. "IVF100,Flat".`,
                    this.input.factoryASTNode ?? this.astNode,
                ),
            );
            return;
        }
        const factoryNLists = Number(match[1]);
        if (this.nLists === factoryNLists) {
            return;
        }
        const nListsArg = `${VECTOR_INDEX_N_LISTS_ARG}: ${factoryNLists}`;
        const change = this.input.nListsASTNode
            ? new TextChange(this.input.nListsASTNode.loc!, String(factoryNLists))
            : this.input.dimensionASTNode?.loc &&
              createInsertionChange(
                  this.input.dimensionASTNode.loc.end,
                  this.input.dimensionASTNode.loc,
                  `, ${nListsArg}`,
              );
        context.addMessage(
            ValidationMessage.error(
                this.nLists == undefined
                    ? `${VECTOR_INDEX_N_LISTS_ARG} needs to be specified if a factory is specified, and it needs to match the number of lists in the factory (${factoryNLists}).`
                    : `${VECTOR_INDEX_N_LISTS_ARG} (${this.nLists}) needs to match the number of lists in the factory "${this.factory}" (${factoryNLists}).`,
                this.input.nListsASTNode ?? this.input.factoryASTNode ?? this.astNode,
                {
                    quickFixes: change
                        ? [
                              new QuickFix({
                                  description:
                                      this.nLists == undefined
                                          ? `Add ${nListsArg}`
                                          : `Change ${VECTOR_INDEX_N_LISTS_ARG} to ${factoryNLists}`,
                                  isPreferred: true,
                                  changeSet: new ChangeSet([change]),
                              }),
                          ]
                        : [],
                },
            ),
        );
    }
}
