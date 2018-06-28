import memorize from 'memorize-decorator';
import { Namespace, RootEntityType } from '../model';
import { EntitiesQueryNode, FirstOfListQueryNode, ObjectQueryNode, QueryNode } from '../query-tree';
import { QUERY_TYPE } from '../schema/constants';
import { getAllEntitiesFieldName, getMetaFieldName } from '../schema/names';
import { flatMap } from '../utils/utils';
import { FilterAugmentation } from './filter-augmentation';
import { ListAugmentation } from './list-augmentation';
import { MetaTypeGenerator } from './meta-type-generator';
import { OutputTypeGenerator } from './output-type-generator';
import { QueryNodeField, QueryNodeListType, QueryNodeNonNullType, QueryNodeObjectType } from './query-node-object-type';
import { getArgumentsForUniqueFields, getEntitiesByUniqueFieldQuery } from './utils/entities-by-uinque-field';

export class QueryTypeGenerator {
    constructor(
        private readonly outputTypeGenerator: OutputTypeGenerator,
        private readonly listAugmentation: ListAugmentation,
        private readonly filterAugmentation: FilterAugmentation,
        private readonly metaTypeGenerator: MetaTypeGenerator
    ) {

    }

    @memorize()
    generate(namespace: Namespace): QueryNodeObjectType {
        return {
            name: namespace.pascalCasePath + QUERY_TYPE,
            fields: [
                ...namespace.childNamespaces.map(namespace => this.getNamespaceField(namespace)),
                ...flatMap(namespace.rootEntityTypes, type => this.getFields(type)),
            ]
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
        return [
            this.getSingleRootEntityField(rootEntityType),
            this.getAllRootEntitiesField(rootEntityType),
            this.getAllRootEntitiesMetaField(rootEntityType)
        ];
    }

    private getSingleRootEntityField(rootEntityType: RootEntityType): QueryNodeField {
        return {
            name: rootEntityType.name,
            type: this.outputTypeGenerator.generate(rootEntityType),
            args: getArgumentsForUniqueFields(rootEntityType),
            description: rootEntityType.description,
            resolve: (_, args) => this.getSingleRootEntityNode(rootEntityType, args)
        };
    }

    private getSingleRootEntityNode(rootEntityType: RootEntityType, args: { [name: string]: any }): QueryNode {
        return new FirstOfListQueryNode(getEntitiesByUniqueFieldQuery(rootEntityType, args));
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
            resolve: () => this.getAllRootEntitiesNode(rootEntityType)
        });
        return this.filterAugmentation.augment(fieldConfig, rootEntityType);
    }
}
