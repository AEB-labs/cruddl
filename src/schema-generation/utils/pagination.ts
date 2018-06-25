import { OrderDirection } from '../../query-tree';
import { FIRST_ARG, ID_FIELD, ORDER_BY_ARG } from '../../schema/constants';
import { OrderByEnumType, OrderByEnumValue } from '../order-by-enum-generator';

export function getOrderByValues(args: any, orderByType: OrderByEnumType, {forceAbsoluteOrder = false}: { readonly forceAbsoluteOrder?: boolean } = {}): ReadonlyArray<OrderByEnumValue> {
    const valueNames = (args[ORDER_BY_ARG] || []) as ReadonlyArray<string>;
    const values = valueNames.map(value => orderByType.getValueOrThrow(value));

    // if first is present, we are paginating, which only works when there is an absolute order
    // To achieve this, we add the 'id' as sort clause
    // Doesn't work on value objects though
    const needsID = forceAbsoluteOrder || FIRST_ARG in args;
    if (needsID && (orderByType.objectType.isChildEntityType || orderByType.objectType.isRootEntityType) && !valueNames.includes(ID_FIELD)) {
        return [
            ...values,
            new OrderByEnumValue([orderByType.objectType.getFieldOrThrow(ID_FIELD)], OrderDirection.ASCENDING)
        ];
    }
    return values;
}
