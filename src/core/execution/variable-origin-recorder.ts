import { getLocation } from 'graphql';
import type { FieldOrigin, QueryTreeVariableOrigins } from '../database/database-adapter.js';
import type { FieldSelection } from '../graphql/query-distiller.js';

/**
 * Collects which GraphQL field each query tree variable has been created for
 *
 * Variables are identified by their index (VariableQueryNode.index). Because indices are assigned
 * in ascending order, the variables created while building the query node of a field form a
 * contiguous range. The ranges of nested fields are contained in the range of their parent field.
 */
export class VariableOriginRecorder implements QueryTreeVariableOrigins {
    private readonly originsByVariableIndex = new Map<number, FieldOrigin>();

    /**
     * Records that the variables with indices in [startIndex, endIndex) have been created for the
     * innermost field of the given selection stack
     *
     * Indices that already have an origin keep it. Because a field is recorded after all its
     * child fields, this attributes each variable to the innermost field that created it.
     */
    recordField(
        startIndex: number,
        endIndex: number,
        selectionStack: ReadonlyArray<FieldSelection>,
    ) {
        let origin: FieldOrigin | undefined;
        for (let index = startIndex; index < endIndex; index++) {
            if (this.originsByVariableIndex.has(index)) {
                continue;
            }
            if (!origin) {
                origin = getFieldOrigin(selectionStack);
                if (!origin) {
                    return;
                }
            }
            this.originsByVariableIndex.set(index, origin);
        }
    }

    getOrigin(variableIndex: number): FieldOrigin | undefined {
        return this.originsByVariableIndex.get(variableIndex);
    }
}

function getFieldOrigin(selectionStack: ReadonlyArray<FieldSelection>): FieldOrigin | undefined {
    const selection = selectionStack[selectionStack.length - 1];
    if (!selection) {
        return undefined;
    }
    const fieldRequest = selection.fieldRequest;
    const loc = fieldRequest.fieldNodes[0]?.loc;
    return {
        path: selectionStack.map((s) => s.propertyName),
        parentTypeName: fieldRequest.parentType.name,
        fieldName: fieldRequest.fieldName,
        loc: loc ? getLocation(loc.source, loc.start) : undefined,
    };
}
