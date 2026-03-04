import type { Namespace, RootEntityType } from '../model/index.js';
import type { QueryNode } from '../query-tree/index.js';
import { EntitiesQueryNode, FirstOfListQueryNode, ObjectQueryNode } from '../query-tree/index.js';
import { QUERY_TYPE } from '../schema/constants.js';
import { getAllEntitiesFieldName, getMetaFieldName } from '../schema/names.js';
import { memoize } from '../utils/memoize.js';

import type { FilterAugmentation } from './filter-augmentation.js';
import type { FlexSearchGenerator } from './flex-search-generator.js';
import type { MetaFirstAugmentation } from './limit-augmentation.js';
import type { ListAugmentation } from './list-augmentation.js';
import type { MetaTypeGenerator } from './meta-type-generator.js';
import { LimitTypeCheckType } from './order-by-and-pagination-augmentation.js';
import type { OutputTypeGenerator } from './output-type-generator.js';
import type {
    FieldContext,
    QueryNodeField,
    QueryNodeObjectType,
} from './query-node-object-type/index.js';
import { QueryNodeListType, QueryNodeNonNullType } from './query-node-object-type/index.js';
import type { UniqueFieldArgumentsGenerator } from './unique-field-arguments-generator.js';
import { getEntitiesByUniqueFieldQuery } from './utils/entities-by-unique-field.js';

export class QueryTypeGenerator {
    constructor(
        private readonly outputTypeGenerator: OutputTypeGenerator,
        private readonly listAugmentation: ListAugmentation,
        private readonly filterAugmentation: FilterAugmentation,
        private readonly metaFirstAugmentation: MetaFirstAugmentation,
        private readonly metaTypeGenerator: MetaTypeGenerator,
        private readonly flexSearchGenerator: FlexSearchGenerator,
        private readonly uniqueFieldArgumentsGenerator: UniqueFieldArgumentsGenerator,
    ) {}

    @memoize()
    generate(namespace: Namespace): QueryNodeObjectType {
        const namespaceDesc = namespace.isRoot
            ? `the root namespace`
            : `the namespace \`${namespace.dotSeparatedPath}\``;

        const namespaceFields = namespace.childNamespaces
            .filter((namespace) => namespace.allRootEntityTypes.length > 0)
            .map((namespace) => this.getNamespaceField(namespace));

        const fields = [
            ...namespaceFields,
            ...namespace.rootEntityTypes.flatMap((type) => this.getFields(type)),
        ];

        return {
            name: namespace.pascalCasePath + QUERY_TYPE,
            description: `The Query type for ${namespaceDesc}`,
            fields: fields,
        };
    }

    private getNamespaceField(namespace: Namespace): QueryNodeField {
        return {
            name: namespace.name || '',
            type: new QueryNodeNonNullType(this.generate(namespace)),
            description: `The Query type for the namespace "${namespace.dotSeparatedPath}"`,
            isPure: true,
            resolve: () => new ObjectQueryNode([]),
        };
    }

    private getFields(rootEntityType: RootEntityType): ReadonlyArray<QueryNodeField> {
        const queryNodeFields = [
            this.getSingleRootEntityField(rootEntityType),
            this.getAllRootEntitiesField(rootEntityType),
            this.getAllRootEntitiesMetaField(rootEntityType),
        ];
        if (rootEntityType.isFlexSearchIndexed) {
            queryNodeFields.push(this.getFlexSearchEntitiesField(rootEntityType));
            queryNodeFields.push(this.getFlexSearchEntitiesFieldMeta(rootEntityType));
        }
        return queryNodeFields;
    }

    private getSingleRootEntityField(rootEntityType: RootEntityType): QueryNodeField {
        let description;
        if (rootEntityType.keyField) {
            description = `Finds a ${rootEntityType.name} by id or ${rootEntityType.keyField.name}.\n\nYou should pass a non-null value to exactly one of the arguments.`;
        } else {
            description = `Finds a ${rootEntityType.name} by id`;
        }
        if (rootEntityType.description) {
            description += `\n\n${rootEntityType.description}`;
        }

        return {
            name: rootEntityType.name,
            type: this.outputTypeGenerator.generate(rootEntityType),
            args: this.uniqueFieldArgumentsGenerator.getArgumentsForUniqueFields(rootEntityType),
            description,
            isPure: true,
            resolve: (_, args, info) => this.getSingleRootEntityNode(rootEntityType, args, info),
        };
    }

    private getSingleRootEntityNode(
        rootEntityType: RootEntityType,
        args: { [name: string]: any },
        context: FieldContext,
    ): QueryNode {
        return new FirstOfListQueryNode(
            getEntitiesByUniqueFieldQuery(rootEntityType, args, context),
        );
    }

    private getAllRootEntitiesField(rootEntityType: RootEntityType): QueryNodeField {
        const fieldConfig = {
            name: getAllEntitiesFieldName(rootEntityType),
            type: new QueryNodeListType(
                new QueryNodeNonNullType(this.outputTypeGenerator.generate(rootEntityType)),
            ),
            description: rootEntityType.description,
            isPure: true,
            resolve: () => this.getAllRootEntitiesNode(rootEntityType),
        };
        return this.listAugmentation.augment(fieldConfig, rootEntityType, {
            orderByAugmentationOptions: { firstLimitCheckType: LimitTypeCheckType.RESOLVER },
        });
    }

    private getAllRootEntitiesNode(rootEntityType: RootEntityType): QueryNode {
        return new EntitiesQueryNode(rootEntityType);
    }

    private getAllRootEntitiesMetaField(rootEntityType: RootEntityType): QueryNodeField {
        const metaType = this.metaTypeGenerator.generate();
        const fieldConfig = {
            name: getMetaFieldName(getAllEntitiesFieldName(rootEntityType)),
            type: new QueryNodeNonNullType(metaType),
            description: rootEntityType.description,
            // meta fields should never be null. Also, this is crucial for performance. Without it, we would introduce
            // an unnecessary variable with the collection contents (which is slow) and we would to an equality check of
            // a collection against NULL which is deadly (v8 evaluation)
            skipNullCheck: true,
            isPure: true,
            resolve: () => this.getAllRootEntitiesNode(rootEntityType),
        };
        return this.metaFirstAugmentation.augment(
            this.filterAugmentation.augment(fieldConfig, rootEntityType),
        );
    }

    private getFlexSearchEntitiesField(rootEntityType: RootEntityType): QueryNodeField {
        return this.flexSearchGenerator.generate(rootEntityType);
    }

    private getFlexSearchEntitiesFieldMeta(rootEntityType: RootEntityType): QueryNodeField {
        const metaType = this.metaTypeGenerator.generate();
        return this.flexSearchGenerator.generateMeta(rootEntityType, metaType);
    }
}
