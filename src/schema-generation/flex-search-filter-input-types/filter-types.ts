import { Thunk } from 'graphql';
import { Field } from '../../model';
import {
    BinaryOperationQueryNode,
    BinaryOperator,
    ConstBoolQueryNode,
    NullQueryNode,
    QueryNode,
} from '../../query-tree';
import { AnyValue, objectEntries } from '../../utils/utils';
import { QueryNodeResolveInfo } from '../query-node-object-type';
import { TypedInputObjectType } from '../typed-input-object-type';
import { and } from '../utils/input-types';
import { FlexSearchFilterField } from './filter-fields';

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
        const filterNodes = objectEntries(filterValue as any).map(([name, value]) =>
            this.getFieldOrThrow(name).getFilterNode(sourceNode, value, path, info),
        );
        return filterNodes.reduce(and, ConstBoolQueryNode.TRUE);
    }
}

export class FlexSearchI18nStringLocalizedFilterObjectType extends FlexSearchFilterObjectType {
    constructor(fields: Thunk<ReadonlyArray<FlexSearchFilterField>>) {
        super(
            `I18nStringLocalizedFilter`,
            fields,
            `Allows to on a specific localization of an \`I18nString\`\n\n` +
                `The language should be provided in the special \`language\` field. All other fields are *and*-combined. There are no fallback rules for string localization; if there is no localization for the given language, the filter acts as if the field was \`null\`.`,
        );
    }
}
