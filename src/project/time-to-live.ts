import { DateTimeFormatter, Instant, ZonedDateTime, ZoneId } from '@js-joda/core';
import { Clock } from '../execution/execution-options';
import { Field, ScalarType } from '../model';
import { TimeToLiveType } from '../model/implementation/time-to-live';
import {
    BinaryOperationQueryNode,
    BinaryOperator,
    CountQueryNode,
    DeleteEntitiesResultValue,
    EntitiesQueryNode,
    FieldPathQueryNode,
    LiteralQueryNode,
    NullQueryNode,
    ObjectQueryNode,
    PropertySpecification,
    QueryNode,
    TransformListQueryNode,
    VariableQueryNode,
} from '../query-tree';
import { generateDeleteAllQueryNode } from '../schema-generation';
import { getScalarFilterValueNode } from '../schema-generation/filter-input-types/filter-fields';
import { GraphQLLocalDate } from '../schema/scalars/local-date';
import { decapitalize } from '../utils/utils';

export interface GetQueryNodeArgs {
    readonly ttlType: TimeToLiveType;
    readonly clock: Clock;
    readonly maxCount?: number;
}

export interface TTLInfoQueryNodeArgs {
    readonly ttlType: TimeToLiveType;
    readonly overdueDelta: number;
    readonly clock: Clock;
}

export interface TTLInfo {
    readonly typeName: string;
    readonly dateField: string;
    readonly expireAfterDays: number;
    readonly expiredObjectCount: number;
    readonly overdueObjectCount: number;
}

export function getQueryNodeForTTLType({ ttlType, maxCount, clock }: GetQueryNodeArgs): QueryNode {
    if (!ttlType.rootEntityType) {
        throw new Error(`The ttlType does not specify a valid rootEntityType.`);
    }
    if (!ttlType.path || !ttlType.path.length) {
        throw new Error(`The ttlType does not specify a valid path.`);
    }
    if (!ttlType.fieldType) {
        throw new Error(`The ttlType does not have a valid fieldType.`);
    }

    const deleteFrom = calcDeleteFrom({
        expireAfterDays: ttlType.expireAfterDays,
        fieldType: ttlType.fieldType,
        clock,
    });
    const listItemVar = new VariableQueryNode(decapitalize(ttlType.rootEntityType.name));

    const listQueryNode = new TransformListQueryNode({
        listNode: new EntitiesQueryNode(ttlType.rootEntityType),
        itemVariable: listItemVar,
        filterNode: getTTLFilter(ttlType.fieldType, ttlType.path, deleteFrom, listItemVar),
        maxCount,
    });
    return generateDeleteAllQueryNode(ttlType.rootEntityType, listQueryNode, {
        resultValue: DeleteEntitiesResultValue.COUNT,
        additionalCascadeFields: ttlType.cascadeFields,
    });
}

export function getTTLInfoQueryNode({ ttlType, overdueDelta, clock }: TTLInfoQueryNodeArgs) {
    if (!ttlType.rootEntityType) {
        throw new Error(`The ttlType does not specify a valid rootEntityType.`);
    }
    if (!ttlType.path || !ttlType.path.length) {
        throw new Error(`The ttlType does not specify a valid path.`);
    }
    if (!ttlType.fieldType) {
        throw new Error(`The ttlType does not have a valid fieldType.`);
    }
    const expiredVariableNode = new VariableQueryNode();
    const overdueVariableNode = new VariableQueryNode();
    return new ObjectQueryNode([
        new PropertySpecification('typeName', new LiteralQueryNode(ttlType.input.typeName)),
        new PropertySpecification('dateField', new LiteralQueryNode(ttlType.input.dateField)),
        new PropertySpecification(
            'expireAfterDays',
            new LiteralQueryNode(ttlType.input.expireAfterDays),
        ),
        new PropertySpecification(
            'expiredObjectCount',
            new CountQueryNode(
                new TransformListQueryNode({
                    listNode: new EntitiesQueryNode(ttlType.rootEntityType),
                    itemVariable: expiredVariableNode,
                    filterNode: getTTLFilter(
                        ttlType.fieldType,
                        ttlType.path,
                        calcDeleteFrom({
                            expireAfterDays: ttlType.expireAfterDays,
                            fieldType: ttlType.fieldType,
                            clock,
                        }),
                        expiredVariableNode,
                    ),
                }),
            ),
        ),
        new PropertySpecification(
            'overdueObjectCount',
            new CountQueryNode(
                new TransformListQueryNode({
                    listNode: new EntitiesQueryNode(ttlType.rootEntityType),
                    itemVariable: overdueVariableNode,
                    filterNode: getTTLFilter(
                        ttlType.fieldType,
                        ttlType.path,
                        calcDeleteFrom({
                            expireAfterDays: ttlType.expireAfterDays + overdueDelta,
                            fieldType: ttlType.fieldType,
                            clock,
                        }),
                        overdueVariableNode,
                    ),
                }),
            ),
        ),
    ]);
}

interface CalcDeleteFromArgs {
    readonly expireAfterDays: number;
    readonly fieldType: ScalarType | undefined;
    readonly clock: Clock;
}

function getTTLFilter(
    fieldType: ScalarType,
    path: ReadonlyArray<Field>,
    deleteFrom: string,
    listItemVar: VariableQueryNode,
) {
    const filterNode = new BinaryOperationQueryNode(
        getScalarFilterValueNode(new FieldPathQueryNode(listItemVar, path), fieldType),
        BinaryOperator.LESS_THAN,
        new LiteralQueryNode(deleteFrom),
    );
    const nullFilterNode = new BinaryOperationQueryNode(
        getScalarFilterValueNode(new FieldPathQueryNode(listItemVar, path), fieldType),
        BinaryOperator.GREATER_THAN,
        new NullQueryNode(),
    );
    return new BinaryOperationQueryNode(filterNode, BinaryOperator.AND, nullFilterNode);
}

function calcDeleteFrom({ expireAfterDays, fieldType, clock }: CalcDeleteFromArgs) {
    if (!fieldType) {
        throw new Error(`The ttl-type dateField does not have a valid type.`);
    }

    const now = Instant.parse(clock.getCurrentTimestamp());

    // Use westernmost timezone for LocalDate so objects are only deleted when they are expired everywhere in the world
    const currentTime: ZonedDateTime =
        fieldType.name === GraphQLLocalDate.name
            ? now.atZone(ZoneId.of('UTC+12:00'))
            : now.atZone(ZoneId.UTC);

    return currentTime.minusDays(expireAfterDays).format(DateTimeFormatter.ISO_INSTANT);
}
