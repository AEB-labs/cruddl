import { Type } from '../model';
import { TransformListQueryNode, VariableQueryNode } from '../query-tree';
import { FILTER_ARG } from '../schema/schema-defaults';
import { decapitalize } from '../utils/utils';
import { FilterTypeGenerator } from './filter-input-types';
import { QueryNodeField } from './query-node-object-type';
import { buildSafeListQueryNode } from './query-node-utils';

/**
 * Augments list fields with filter and pagination features
 */
export class ListAugmentation {
    constructor(
        private readonly filterTypeGenerator: FilterTypeGenerator
    ) {
    }

    augment(schemaField: QueryNodeField, type: Type): QueryNodeField {
        if (!type.isObjectType) {
            return schemaField;
        }

        const filterType = this.filterTypeGenerator.generate(type);

        return {
            ...schemaField,
            args: {
                ...schemaField.args,
                [FILTER_ARG]: {
                    type: filterType.getInputType()
                }
            },
            resolve: (sourceNode, args) => {
                let listNode = schemaField.resolve(sourceNode, args);
                listNode = buildSafeListQueryNode(listNode);
                const itemVariable = new VariableQueryNode(decapitalize(type.name));
                const filterValue = args[FILTER_ARG];
                const filterNode = filterValue != undefined ? filterType.getFilterNode(itemVariable, args[FILTER_ARG]) : undefined;
                return new TransformListQueryNode({
                    listNode,
                    itemVariable,
                    filterNode
                });
            }
        };
    };

}
