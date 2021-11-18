import { FieldPath } from './field-path';
import { OrderDirection } from './order';

export const IDENTITY_ANALYZER = 'identity';
export const NORM_CI_ANALYZER = 'norm_ci';

export class FlexSearchPrimarySortClause {
    constructor(readonly field: FieldPath, readonly direction: OrderDirection) {}
}
