import { FieldSelection } from '../../graphql/query-distiller';

export interface FieldContext {
    readonly selectionStack: ReadonlyArray<FieldSelection>
}
