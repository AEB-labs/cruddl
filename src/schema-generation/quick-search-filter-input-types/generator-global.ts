import { Thunk } from 'graphql';
import memorize from 'memorize-decorator';
import { Field, RootEntityType } from '../../model/implementation';
import { BinaryOperationQueryNode, BinaryOperator, ConstBoolQueryNode, NullQueryNode, QueryNode } from '../../query-tree';
import { getQuickSearchGlobalFilterTypeName } from '../../schema/names';
import { AnyValue, flatMap, objectEntries } from '../../utils/utils';
import { EnumTypeGenerator } from '../enum-type-generator';
import { AndFilterField, FilterField, OrFilterField } from '../filter-input-types/filter-fields';
import { resolveThunk } from '../query-node-object-type';
import { TypedInputObjectType } from '../typed-input-object-type';
import { and } from './constants';
import { QuickSearchFilterTypeGenerator } from './generator';


// @MSF GLOBAL TODO: remove
export class QuickSearchGlobalFilterObjectType extends TypedInputObjectType<FilterField> {
    constructor(
        fields: Thunk<ReadonlyArray<FilterField>>
    ) {
        super(getQuickSearchGlobalFilterTypeName(), fields, `QuickSearchFilter type for global-quick-search.\n\nAll fields in this type are *and*-combined; see the \`or\` field for *or*-combination.`);
        // @MSF GLOBAL TODO: description
    }

    getFilterNode(sourceNode: QueryNode, filterValue: AnyValue): QueryNode {
        if (typeof filterValue !== 'object' || filterValue === null) {
            return new BinaryOperationQueryNode(sourceNode, BinaryOperator.EQUAL, NullQueryNode.NULL);
        }
        const filterNodes = objectEntries(filterValue)
            .map(([name, value]) => this.getFieldOrThrow(name).getFilterNode(sourceNode, value));
        return filterNodes.reduce(and, ConstBoolQueryNode.TRUE);
    }
}

// @MSF GLOBAL TODO: remove
export class QuickSearchGlobalFilterTypeGenerator {

    constructor(private quickSearchFilterTypeGenerator: QuickSearchFilterTypeGenerator, private enumTypeGenerator: EnumTypeGenerator) {
    }

    @memorize()
    generateGlobal(types: ReadonlyArray<RootEntityType>): QuickSearchGlobalFilterObjectType {
        return this.generateQuickSearchGlobalFilterType(() => {
            let fields = flatMap(types, type => type.fields.filter(value => type.keyField == value));
            fields = fields.filter((value, index, array) => {
                return !array.find((value1, index1) => value.name === value1.name && index1 < index);
            });
            return flatMap(
                fields,
                (field: Field) => this.quickSearchFilterTypeGenerator.generateFieldQuickSearchFilterFields(field) // @MSF GLOBAL TODO: fix languages and description (only language and description of first found field count right now)
            );
        });

    }

    private generateQuickSearchGlobalFilterType(fields: Thunk<ReadonlyArray<FilterField>>): QuickSearchGlobalFilterObjectType {
        function getFields(): ReadonlyArray<FilterField> {
            return [
                ...resolveThunk(fields),
                new AndFilterField(filterType),
                new OrFilterField(filterType)
            ];
        }

        const filterType = new QuickSearchGlobalFilterObjectType(getFields);
        return filterType;
    }
}