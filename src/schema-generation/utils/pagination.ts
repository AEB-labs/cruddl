import { OrderDirection } from '../../query-tree';
import { ID_FIELD, ORDER_BY_ARG } from '../../schema/schema-defaults';
import { OrderByEnumType, OrderByEnumValue } from '../order-by-enum-generator';

export function getOrderByValues(args: any, orderByType: OrderByEnumType): ReadonlyArray<OrderByEnumValue> {
    const valueNames = (args[ORDER_BY_ARG] || []) as ReadonlyArray<string>;
    const values = valueNames.map(value => orderByType.getValueOrThrow(value));

    // If possible, add 'id' so that we have an absolute order
    if (values.length > 0 && (orderByType.objectType.isChildEntityType || orderByType.objectType.isRootEntityType) && !valueNames.includes(ID_FIELD)) {
        return [
            ...values,
            new OrderByEnumValue([orderByType.objectType.getFieldOrThrow(ID_FIELD)], OrderDirection.ASCENDING)
        ];
    }
    return values;
}
