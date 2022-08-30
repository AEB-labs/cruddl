import { OrderDirection } from '../../query-tree';
import { ORDER_BY_ARG } from '../../schema/constants';
import { OrderByEnumType, OrderByEnumValue } from '../order-by-enum-generator';

export function getOrderByValues(
    args: any,
    orderByType: OrderByEnumType,
    { isAbsoluteOrderRequired }: { readonly isAbsoluteOrderRequired: boolean },
): ReadonlyArray<OrderByEnumValue> {
    const valueNames = (args[ORDER_BY_ARG] || []) as ReadonlyArray<string>;
    const values = valueNames.map((value) => orderByType.getValueOrThrow(value));

    // if we need to guarantee that the order clause is absolute, we might have to add the 'id' field
    if (
        isAbsoluteOrderRequired &&
        (orderByType.objectType.isChildEntityType || orderByType.objectType.isRootEntityType)
    ) {
        const discriminatorField = orderByType.objectType.discriminatorField;
        // indices only work if all directions are equal. So if all are descending, add the discriminator field
        // descending, too - otherwise, it does not matter, so we default to ascending. If there are no values, default
        // to ascending, too.
        let direction =
            values.length > 0 &&
            values.every((value) => value.direction === OrderDirection.DESCENDING)
                ? OrderDirection.DESCENDING
                : OrderDirection.ASCENDING;

        if (!values.some((v) => v.path.length === 1 && v.path[0] === discriminatorField)) {
            return [...values, new OrderByEnumValue([discriminatorField], direction)];
        }
    }
    return values;
}
