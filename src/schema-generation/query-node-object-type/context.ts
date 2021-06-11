import { FieldSelection } from '../../graphql/query-distiller';

export class SelectionToken {
    // prevent structural equality checks
    private _selectionToken: undefined;
}

export interface FieldContext {
    readonly selectionStack: ReadonlyArray<FieldSelection>;
    readonly flexSearchMaxFilterableAmountOverride?: number;
    readonly flexSearchRecursionDepth?: number;

    /**
     * A stack of objects that correspond to the selections that are intended to be used with WeakMaps to store
     * additional information
     */
    readonly selectionTokenStack: ReadonlyArray<SelectionToken>;
}
