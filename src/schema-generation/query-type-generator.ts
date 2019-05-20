import memorize from 'memorize-decorator';
import { Namespace, RootEntityType } from '../model';
import { EntitiesQueryNode, FirstOfListQueryNode, ObjectQueryNode, QueryNode } from '../query-tree';
import { QUERY_TYPE } from '../schema/constants';
import { getAllEntitiesFieldName, getMetaFieldName, getQuickSearchEntitiesFieldName } from '../schema/names';
import { flatMap } from '../utils/utils';
import { FilterAugmentation } from './filter-augmentation';
import { MetaFirstAugmentation } from './limit-augmentation';
import { ListAugmentation } from './list-augmentation';
import { MetaTypeGenerator } from './meta-type-generator';
import { OutputTypeGenerator } from './output-type-generator';
import { FieldContext, QueryNodeField, QueryNodeListType, QueryNodeNonNullType, QueryNodeObjectType } from './query-node-object-type';
import { getArgumentsForUniqueFields, getEntitiesByUniqueFieldQuery } from './utils/entities-by-unique-field';
import { QuickSearchAugmentation } from './quick-search-augmentation';
import { GraphQLUnionType } from 'graphql';
import { QuickSearchQueryNode } from '../query-tree/quick-search';
import { QuickSearchGlobalAugmentation } from './quick-search-global-augmentation';


export class QueryTypeGenerator {
    constructor(
        private readonly outputTypeGenerator: OutputTypeGenerator,
        private readonly listAugmentation: ListAugmentation,
        private readonly filterAugmentation: FilterAugmentation,
        private readonly metaFirstAugmentation: MetaFirstAugmentation,
        private readonly metaTypeGenerator: MetaTypeGenerator,
        private readonly quickSearchAugmentation: QuickSearchAugmentation,
        private readonly quickSearchGlobalAugmentation: QuickSearchGlobalAugmentation
    ) {

    }

    @memorize()
    generate(namespace: Namespace): QueryNodeObjectType {
        const namespaceDesc = namespace.isRoot ? `the root namespace` : `the namespace \`${namespace.dotSeparatedPath}\``;

        const namespaceFields = namespace.childNamespaces
            .filter(namespace => namespace.allRootEntityTypes.length > 0)
            .map(namespace => this.getNamespaceField(namespace));

        const fields = [
            ...namespaceFields,
            ...flatMap(namespace.rootEntityTypes, type => this.getFields(type))
        ];

        if (namespace.rootEntityTypes.some(value => value.arangoSearchConfig.isGlobalIndexed)) {
            fields.push(this.getQuickSearchGlobalField(namespace.rootEntityTypes));
            fields.push(this.getQuickSearchGlobalFieldMeta(namespace.rootEntityTypes));
        }

        return {
            name: namespace.pascalCasePath + QUERY_TYPE,
            description: `The Query type for ${namespaceDesc}`,
            fields: fields
        };
    }

    private getNamespaceField(namespace: Namespace): QueryNodeField {
        return {
            name: namespace.name || '',
            type: this.generate(namespace),
            description: `The Query type for the namespace "${namespace.dotSeparatedPath}"`,
            resolve: () => new ObjectQueryNode([])
        };
    }

    private getFields(rootEntityType: RootEntityType): ReadonlyArray<QueryNodeField> {
        const queryNodeFields = [
            this.getSingleRootEntityField(rootEntityType),
            this.getAllRootEntitiesField(rootEntityType),
            this.getAllRootEntitiesMetaField(rootEntityType)
        ];
        if (rootEntityType.arangoSearchConfig.isIndexed) {
            queryNodeFields.push(this.getQuickSearchEntitiesField(rootEntityType));
            queryNodeFields.push(this.getQuickSearchEntitiesFieldMeta(rootEntityType));
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
            args: getArgumentsForUniqueFields(rootEntityType),
            description,
            resolve: (_, args, info) => this.getSingleRootEntityNode(rootEntityType, args, info)
        };
    }

    private getGlobalQuickSearchFieldName(): string {
        return 'quickSearchGlobal'; // @MSF GLOBAL TODO: constant
    }

    private getQuickSearchGlobalField(rootEntityTypes: ReadonlyArray<RootEntityType>): QueryNodeField {
        const fieldConfig = ({
            name: this.getGlobalQuickSearchFieldName(),
            type: new QueryNodeListType(new QueryNodeNonNullType(this.outputTypeGenerator.generateQuickSearchGlobalType(rootEntityTypes))),
            description: 'global search description', // @MSF GLOBAL TODO: description
            resolve: () => new QuickSearchQueryNode({ isGlobal: true, rootEntityType: rootEntityTypes[0] })
        });

        return (this.quickSearchGlobalAugmentation.augment(fieldConfig, rootEntityTypes));
    }

    private getQuickSearchGlobalFieldMeta(rootEntityTypes: ReadonlyArray<RootEntityType>): QueryNodeField {
        const metaType = this.metaTypeGenerator.generate();
        const fieldConfig = ({
            name: getMetaFieldName(this.getGlobalQuickSearchFieldName()),
            type: new QueryNodeNonNullType(metaType),
            description: `description`, // @MSF GLOBAL TODO: description
            // meta fields should never be null. Also, this is crucial for performance. Without it, we would introduce
            // an unnecessary variable with the collection contents (which is slow) and we would to an equality check of
            // a collection against NULL which is deadly (v8 evaluation)
            skipNullCheck: true,
            resolve: () => this.getAllRootEntitiesNode(rootEntityTypes[0]) // @MSF GLOBAL TODO: resolver
        });
        return this.metaFirstAugmentation.augment(this.quickSearchGlobalAugmentation.augment(fieldConfig, rootEntityTypes));
    }

    private getSingleRootEntityNode(rootEntityType: RootEntityType, args: { [name: string]: any }, context: FieldContext): QueryNode {
        return new FirstOfListQueryNode(getEntitiesByUniqueFieldQuery(rootEntityType, args, context));
    }

    private getAllRootEntitiesField(rootEntityType: RootEntityType): QueryNodeField {
        const fieldConfig = ({
            name: getAllEntitiesFieldName(rootEntityType.name),
            type: new QueryNodeListType(new QueryNodeNonNullType(this.outputTypeGenerator.generate(rootEntityType))),
            description: rootEntityType.description,
            resolve: () => this.getAllRootEntitiesNode(rootEntityType)
        });
        return this.listAugmentation.augment(fieldConfig, rootEntityType);
    }

    private getAllRootEntitiesNode(rootEntityType: RootEntityType): QueryNode {
        return new EntitiesQueryNode(rootEntityType);
    }

    private getAllRootEntitiesMetaField(rootEntityType: RootEntityType): QueryNodeField {
        const metaType = this.metaTypeGenerator.generate();
        const fieldConfig = ({
            name: getMetaFieldName(getAllEntitiesFieldName(rootEntityType.name)),
            type: new QueryNodeNonNullType(metaType),
            description: rootEntityType.description,
            // meta fields should never be null. Also, this is crucial for performance. Without it, we would introduce
            // an unnecessary variable with the collection contents (which is slow) and we would to an equality check of
            // a collection against NULL which is deadly (v8 evaluation)
            skipNullCheck: true,
            resolve: () => this.getAllRootEntitiesNode(rootEntityType)
        });
        return this.metaFirstAugmentation.augment(this.filterAugmentation.augment(fieldConfig, rootEntityType));
    }

    private getQuickSearchEntitiesField(rootEntityType: RootEntityType): QueryNodeField {
        //@MSF TODO: put this in the generator instead
        const fieldConfig = ({
            name: getQuickSearchEntitiesFieldName(rootEntityType.name),
            type: new QueryNodeListType(new QueryNodeNonNullType(this.outputTypeGenerator.generate(rootEntityType))),
            description: `Searches for ${rootEntityType.pluralName} using QuickSearch.`,
            resolve: () => new QuickSearchQueryNode({ rootEntityType: rootEntityType })
        });

        return this.listAugmentation.augment(this.quickSearchAugmentation.augment(fieldConfig, rootEntityType), rootEntityType);
    }

    private getQuickSearchEntitiesFieldMeta(rootEntityType: RootEntityType): QueryNodeField {
        const metaType = this.metaTypeGenerator.generate();
        const fieldConfig = ({
            name: getMetaFieldName(getQuickSearchEntitiesFieldName(rootEntityType.name)),
            type: new QueryNodeNonNullType(metaType),
            description: `Searches for ${rootEntityType.pluralName} using QuickSearch.`,
            // meta fields should never be null. Also, this is crucial for performance. Without it, we would introduce
            // an unnecessary variable with the collection contents (which is slow) and we would to an equality check of
            // a collection against NULL which is deadly (v8 evaluation)
            skipNullCheck: true,
            resolve: () => new QuickSearchQueryNode({ rootEntityType: rootEntityType })
        });
        return this.filterAugmentation.augment(this.quickSearchAugmentation.augment(fieldConfig, rootEntityType), rootEntityType);
    }
}
