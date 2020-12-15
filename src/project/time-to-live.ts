import { DateTimeFormatter, ZonedDateTime, ZoneId } from 'js-joda';
import { ExecutionOptions } from '../execution/execution-options';
import { Field, ScalarType } from '../model';
import { TimeToLiveType } from '../model/implementation/time-to-live';
import {
    BinaryOperationQueryNode,
    BinaryOperator,
    CountQueryNode,
    EntitiesQueryNode,
    FieldPathQueryNode,
    ListQueryNode,
    LiteralQueryNode,
    NullQueryNode,
    ObjectQueryNode,
    PropertySpecification,
    QueryNode,
    TransformListQueryNode,
    VariableQueryNode
} from '../query-tree';
import { generateDeleteAllQueryNode } from '../schema-generation';
import { getScalarFilterValueNode } from '../schema-generation/filter-input-types/filter-fields';
import { GraphQLLocalDate } from '../schema/scalars/local-date';
import { decapitalize } from '../utils/utils';

export function getQueryNodeForTTLType(ttlType: TimeToLiveType, executionOptions: ExecutionOptions): QueryNode {
    if (!ttlType.rootEntityType) {
        throw new Error(`The ttlType does not specify a valid rootEntityType.`);
    }
    if (!ttlType.path || !ttlType.path.length) {
        throw new Error(`The ttlType does not specify a valid path.`);
    }
    if (!ttlType.fieldType) {
        throw new Error(`The ttlType does not have a valid fieldType.`);
    }

    const deleteFrom = calcDeleteFrom(ttlType.expireAfterDays, ttlType.fieldType);
    const listItemVar = new VariableQueryNode(decapitalize(ttlType.rootEntityType.name));

    const listQueryNode = new TransformListQueryNode({
        listNode: new EntitiesQueryNode(ttlType.rootEntityType),
        itemVariable: listItemVar,
        filterNode: getTTLFilter(ttlType.fieldType, ttlType.path, deleteFrom, listItemVar),
        maxCount: executionOptions.timeToLiveCleanupLimit
    });
    return new CountQueryNode(generateDeleteAllQueryNode(ttlType.rootEntityType, listQueryNode));
}

export function getTTLFilter(
    fieldType: ScalarType,
    path: ReadonlyArray<Field>,
    deleteFrom: string,
    listItemVar: VariableQueryNode
) {
    const filterNode = new BinaryOperationQueryNode(
        getScalarFilterValueNode(new FieldPathQueryNode(listItemVar, path), fieldType),
        BinaryOperator.LESS_THAN,
        new LiteralQueryNode(deleteFrom)
    );
    const nullFilterNode = new BinaryOperationQueryNode(
        getScalarFilterValueNode(new FieldPathQueryNode(listItemVar, path), fieldType),
        BinaryOperator.GREATER_THAN,
        new NullQueryNode()
    );
    return new BinaryOperationQueryNode(filterNode, BinaryOperator.AND, nullFilterNode);
}

export function calcDeleteFrom(expireAfterDays: number, fieldType: ScalarType | undefined) {
    if (!fieldType) {
        throw new Error(`The ttl-type dateField does not have a valid type.`);
    }

    // Use westernmost timezone for LocalDate so objects are only deleted when they are expired everywhere in the world
    const currentTime: ZonedDateTime =
        fieldType.name === GraphQLLocalDate.name
            ? ZonedDateTime.now(ZoneId.of('Etc/GMT+12'))
            : ZonedDateTime.now(ZoneId.UTC);

    return currentTime.minusDays(expireAfterDays).format(DateTimeFormatter.ISO_INSTANT);
}

export function getTTLInfoQueryNode(ttlType: TimeToLiveType, overdueDelta: number) {
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
        new PropertySpecification('path', new LiteralQueryNode(ttlType.input.dateField)),
        new PropertySpecification('path', new LiteralQueryNode(ttlType.input.expireAfterDays)),
        new PropertySpecification(
            'expiredObjectCount',
            new CountQueryNode(
                new TransformListQueryNode({
                    listNode: new EntitiesQueryNode(ttlType.rootEntityType),
                    itemVariable: expiredVariableNode,
                    filterNode: getTTLFilter(
                        ttlType.fieldType,
                        ttlType.path,
                        calcDeleteFrom(ttlType.expireAfterDays, ttlType.fieldType),
                        expiredVariableNode
                    )
                })
            )
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
                        calcDeleteFrom(ttlType.expireAfterDays + overdueDelta, ttlType.fieldType),
                        overdueVariableNode
                    )
                })
            )
        )
    ]);
}

export interface TTLInfo {
    typeName: string;
    path: string;
    amountOfDays: number;
    expiredObjectCount: number;
    overdueObjectCount: number;
}
