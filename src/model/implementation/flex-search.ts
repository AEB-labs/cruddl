import { FieldPath } from './field-path';
import { OrderDirection } from './order';

export class FlexSearchPrimarySortClause {
    constructor(readonly field: FieldPath, readonly direction: OrderDirection) {}
}
