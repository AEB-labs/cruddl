import { StringValueNode } from 'graphql';
import memorize from 'memorize-decorator';
import { flatMap } from '../../utils/utils';
import { TraversalConfig } from '../config';
import { locationWithinStringArgument, ValidationContext, ValidationMessage } from '../validation';
import { Field } from './field';
import { RelationSide } from './relation';
import { RootEntityType } from './root-entity-type';
import { ObjectType, Type } from './type';

interface PathSegmentBase {
    readonly kind: 'field' | 'relation' | 'traversal';
    readonly field: Field
    readonly resultingType: Type
    readonly isListSegment: boolean
    readonly resultIsList: boolean
}

export interface FieldSegment extends PathSegmentBase {
    readonly kind: 'field'
}

export interface RelationSegment extends PathSegmentBase {
    readonly kind: 'relation'
    readonly relationSide: RelationSide
    readonly resultingType: RootEntityType
    readonly minDepth: number
    readonly maxDepth: number
}

// for embedding another traversal
export interface TraversalSegment extends PathSegmentBase {
    readonly kind: 'traversal';
    readonly path: FieldPath
}

class FieldPathRecursionError extends Error {
    constructor() {
        super(`Field path recursion`);
        this.name = this.constructor.name;
    }
}

export type PathSegment = FieldSegment | RelationSegment | TraversalSegment;

export class FieldPath {
    public readonly path: string;
    private readonly astNode: StringValueNode | undefined;

    constructor(config: TraversalConfig, public readonly declaringType: ObjectType) {
        this.path = config.path;
        this.astNode = config.pathASTNode;
    }

    @memorize()
    get segments(): ReadonlyArray<PathSegment> {
        return this.traversePath(() => undefined);
    }

    getFlatSegments(): ReadonlyArray<FieldSegment | RelationSegment> {
        return flatMap(this.segments, seg => seg.kind === 'traversal' ? seg.path.getFlatSegments() : [seg]);
    }

    get resultingType(): Type | undefined {
        const segments = this.segments;
        const lastSegment = segments[segments.length - 1];
        if (!lastSegment) {
            return undefined;
        }
        return lastSegment.resultingType;
    }

    get resultIsList(): boolean {
        const segments = this.segments;
        if (!segments.length) {
            return false;
        }
        return segments[segments.length - 1].resultIsList;
    }

    /**
     * @return true if valid, false if invalid
     */
    validate(context: ValidationContext): boolean {
        const path = this.traversePath(context.addMessage.bind(context));
        return path.length > 0;
    }

    private traversePath(addMessage: (mess: ValidationMessage) => void, pathStack?: ReadonlyArray<FieldPath>): ReadonlyArray<PathSegment> {
        const segmentSpecifiers = this.path.split('.');
        if (!this.path || !segmentSpecifiers.length) {
            addMessage(ValidationMessage.error(`The path cannot be empty.`, this.astNode));
            return [];
        }

        let currentType: Type = this.declaringType;
        let segments: PathSegment[] = [];
        let currentResultIsList = false;
        let currentOffset = 0;
        for (const segmentSpecifier of segmentSpecifiers) {
            const segmentLocation = this.astNode ? locationWithinStringArgument(this.astNode, currentOffset, segmentSpecifier.length) : undefined;

            if (!currentType.isObjectType) {
                addMessage(ValidationMessage.error(`Type "${currentType.name}" is not an object type and cannot be traversed into.`, segmentLocation));
                return [];
            }

            if (!segmentSpecifier) {
                addMessage(ValidationMessage.error(`The path should consist of dot-separated segments.`, this.astNode));
                return [];
            }
            const parsed = parseSegmentSpecifier(segmentSpecifier);
            if (!parsed) {
                addMessage(ValidationMessage.error(`The path segment "${segmentSpecifier}" is invalid. It should be a field name, optionally followed by a depth specifier like {1,2}.`, segmentLocation));
                return [];
            }
            let { fieldName, minDepth, maxDepth } = parsed;
            const field: Field | undefined = currentType.getField(fieldName);
            if (!field) {
                addMessage(ValidationMessage.error(`Type "${currentType.name}" does not have a field "${fieldName}".`, segmentLocation));
                return [];
            }

            if (field.isList) {
                currentResultIsList = true;
            }

            // by disallowing references, we make sure the traversal can be done by a graph traversal followed by an intra-root-entity traversal
            // also, references are supposed to be loosely coupled, and adding a traversal fields tightens that coupling.
            if (field.isReference) {
                addMessage(ValidationMessage.error(`Field "${currentType.name}.${field.name}" is a reference and cannot be used in a traversal.`, segmentLocation));
                return [];
            }

            if (field.isAggregation) {
                addMessage(ValidationMessage.error(`Field "${currentType.name}.${field.name}" is an aggregation field and cannot be used in a traversal.`, segmentLocation));
                return [];
            }

            if (field.isTraversal) {
                if (field.traversalPath) {
                    // begin ugly code
                    // this works as follows:
                    // - a regular call of traversePath (e.g. through get segments()) goes into the else branch and initiates the recursion check
                    // - a call of traversePath within the recursion check goes into the then branch, does the recursion check, and digs further into
                    // only the "regular calls" generate errors because that's the path we're actually validating
                    if (pathStack) {
                        if (pathStack.includes(field.traversalPath)) {
                            throw new FieldPathRecursionError();
                        }
                        field.traversalPath.traversePath(() => undefined, [...pathStack, this]);
                    } else {
                        try {
                            field.traversalPath.traversePath(() => undefined, [this]);
                        } catch (e) {
                            if (e instanceof FieldPathRecursionError) {
                                addMessage(ValidationMessage.error(`Traversal field "${field.name}" cannot be used here because it would cause a recursion.`, segmentLocation));
                                return [];
                            }
                            throw e;
                        }
                    }
                    // end ugly code
                }

                if (!field.traversalPath || !field.traversalPath.resultingType) {
                    addMessage(ValidationMessage.error(`The traversal path of "${currentType.name}.${field.name}" has validation errors.`, this.astNode));
                    return [];
                }
                segments.push({
                    kind: 'traversal',
                    path: field.traversalPath,
                    isListSegment: field.traversalPath.resultIsList,
                    resultIsList: currentResultIsList,
                    field,
                    resultingType: field.traversalPath.resultingType
                });
            } else if (field.type.isRootEntityType) {
                const relationSide = field.relationSide;
                if (!relationSide) {
                    // might occur if directives are missing
                    addMessage(ValidationMessage.error(`Field "${currentType.name}.${field.name}" is a root entity, but not a relation, and cannot be used in a traversal.`, segmentLocation));
                    return [];
                }

                if (minDepth != undefined) {
                    if (field.type !== currentType) {
                        addMessage(ValidationMessage.error(`A depth specifier is only valid for recursive relation fields, and field "${currentType.name}.${field.name}" is not of type "${currentType.name}", but of type "${field.type.name}".`, segmentLocation));
                        return [];
                    }
                    if (maxDepth == undefined) {
                        maxDepth = minDepth;
                    } else if (maxDepth < minDepth) {
                        addMessage(ValidationMessage.error(`The maximum depth (${maxDepth}) cannot be lower than the minimum depth (${minDepth}).`, segmentLocation));
                        return [];
                    } else if (maxDepth > 1 && !field.isList) {
                        addMessage(ValidationMessage.error(`The maximum depth of "${currentType.name}.${field.name}" cannot be higher than 1 because it is a to-1 relation.`, segmentLocation));
                        return [];
                    }
                } else {
                    minDepth = 1;
                    maxDepth = 1;
                }

                if (minDepth !== 1 || maxDepth !== 1) {
                    // adding {0,1} can convert a to-1 relation to a list (because it now contains up to two objects)
                    currentResultIsList = true;
                }

                segments.push({
                    kind: 'relation',
                    field,
                    minDepth,
                    maxDepth,
                    relationSide,
                    isListSegment: field.isList,
                    resultIsList: currentResultIsList,
                    resultingType: field.type
                });
            } else {
                if (minDepth != undefined) {
                    addMessage(ValidationMessage.error(`A depth specifier is only valid for relation fields, and field "${currentType.name}.${field.name}" is not a relation.`, segmentLocation));
                    return [];
                }

                segments.push({
                    kind: 'field',
                    field,
                    resultingType: field.type,
                    isListSegment: field.isList,
                    resultIsList: currentResultIsList
                });
            }

            currentType = field.type;
            currentOffset += segmentSpecifier.length + 1; // account for dot
        }

        if (!segments.length) {
            return [];
        }

        return segments;
    }
}

function parseSegmentSpecifier(specifier: string): { readonly fieldName: string, minDepth?: number, maxDepth?: number } | undefined {
    const matches = specifier.match(/^(\w+)({(\d+)(,(\s*\d))*})?$/);
    if (!matches) {
        return undefined;
    }
    const [/* field{1,2} */, fieldName, /* {1,2} */, minDepth, /* ,2 */, maxDepth] = matches;
    return {
        fieldName,
        minDepth: minDepth != undefined ? Number(minDepth) : undefined,
        maxDepth: maxDepth != undefined ? Number(maxDepth) : undefined
    };
}

export function getEffectiveTraversalSegments(path: FieldPath): {
    readonly relationSegments: ReadonlyArray<RelationSegment>,
    readonly fieldSegments: ReadonlyArray<FieldSegment>
} {
    const relationSegments = [];
    const fieldSegments = [];
    for (const segment of path.getFlatSegments()) {
        switch (segment.kind) {
            case 'field':
                fieldSegments.push(segment);
                break;
            case 'relation':
                if (fieldSegments.length) {
                    throw new Error(`Unexpected field segment after relation segments in traversal path "${path.path}"`);
                }
                relationSegments.push(segment);
                break;
            default:
                throw new Error(`Unexpected segment kind ${(segment as any).kind as any}`);
        }
    }
    return {
        fieldSegments,
        relationSegments
    };
}
