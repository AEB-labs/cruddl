import type { ThunkReadonlyArray } from 'graphql';
import type { Field } from '../../model/index.js';
import type { QueryNode } from '../../query-tree/index.js';
import {
    BinaryOperationQueryNode,
    BinaryOperator,
    ConstBoolQueryNode,
    NullQueryNode,
} from '../../query-tree/index.js';
import type { AnyValue } from '../../utils/utils.js';
import type { QueryNodeResolveInfo } from '../query-node-object-type/index.js';
import { TypedInputObjectType } from '../typed-input-object-type.js';
import { and } from '../utils/input-types.js';
import type { FlexSearchFilterField } from './filter-fields.js';

export class FlexSearchFilterObjectType extends TypedInputObjectType<FlexSearchFilterField> {
    getFilterNode(
        sourceNode: QueryNode,
        filterValue: AnyValue,
        path: ReadonlyArray<Field>,
        info: QueryNodeResolveInfo,
    ): QueryNode {
        if (typeof filterValue !== 'object' || filterValue === null) {
            return new BinaryOperationQueryNode(
                sourceNode,
                BinaryOperator.EQUAL,
                NullQueryNode.NULL,
            );
        }
        const filterNodes = Object.entries(filterValue as any).map(([name, value]) =>
            this.getFieldOrThrow(name).getFilterNode(sourceNode, value, path, info),
        );
        return filterNodes.reduce(and, ConstBoolQueryNode.TRUE);
    }
}

export class FlexSearchI18nStringLocalizedFilterObjectType extends FlexSearchFilterObjectType {
    constructor(fields: ThunkReadonlyArray<FlexSearchFilterField>) {
        super(
            `I18nStringLocalizedFilter`,
            fields,
            `Allows to on a specific localization of an \`I18nString\`\n\n` +
                `The language should be provided in the special \`language\` field. All other fields are *and*-combined. There are no fallback rules for string localization; if there is no localization for the given language, the filter acts as if the field was \`null\`.`,
        );
    }
}
