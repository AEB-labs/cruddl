import memorize from 'memorize-decorator';
import { Namespace, RootEntityType } from '../model';
import { EntitiesQueryNode, FirstOfListQueryNode, ObjectQueryNode, QueryNode } from '../query-tree';
import { QUERY_TYPE } from '../schema/constants';
import { getAllEntitiesFieldName, getMetaFieldName } from '../schema/names';
import { flatMap } from '../utils/utils';
import { FilterAugmentation } from './filter-augmentation';
import { FlexSearchGenerator } from './flex-search-generator';
import { MetaFirstAugmentation } from './limit-augmentation';
import { ListAugmentation } from './list-augmentation';
import { MetaTypeGenerator } from './meta-type-generator';
import { OutputTypeGenerator } from './output-type-generator';
import {
    FieldContext,
    QueryNodeField,
    QueryNodeListType,
    QueryNodeNonNullType,
    QueryNodeObjectType,
} from './query-node-object-type';
import { UniqueFieldArgumentsGenerator } from './unique-field-arguments-generator';
import { getEntitiesByUniqueFieldQuery } from './utils/entities-by-unique-field';
import { LimitTypeCheckType } from './order-by-and-pagination-augmentation';

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

    @memorize()
    generate(namespace: Namespace): QueryNodeObjectType {
        const namespaceDesc = namespace.isRoot
            ? `the root namespace`
            : `the namespace \`${namespace.dotSeparatedPath}\``;

        const namespaceFields = namespace.childNamespaces
            .filter((namespace) => namespace.allRootEntityTypes.length > 0)
            .map((namespace) => this.getNamespaceField(namespace));

        const fields = [
            ...namespaceFields,
            ...flatMap(namespace.rootEntityTypes, (type) => this.getFields(type)),
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
