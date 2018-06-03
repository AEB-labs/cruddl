import memorize from 'memorize-decorator';
import * as pluralize from 'pluralize';
import { Namespace, RootEntityType } from '../model';
import { EntitiesQueryNode, FirstOfListQueryNode, ObjectQueryNode, QueryNode } from '../query-tree';
import { ALL_ENTITIES_FIELD_PREFIX } from '../schema/schema-defaults';
import { ListAugmentation } from './list-augmentation';
import { OutputTypeGenerator } from './output-type-generator';
import { QueryNodeField, QueryNodeListType, QueryNodeNonNullType, QueryNodeObjectType } from './query-node-object-type';
import { getArgumentsForUniqueFields, getEntitiesByUniqueFieldQuery } from './utils/entities-by-uinque-field';

export class QueryTypeGenerator {
    constructor(
        private readonly outputTypeGenerator: OutputTypeGenerator,
        private readonly listAugmentation: ListAugmentation
    ) {

    }

    @memorize()
    generate(namespace: Namespace): QueryNodeObjectType {
        const namespaceFields = namespace.childNamespaces.map((n): QueryNodeField => ({
            name: n.name || '',
            type: this.generate(n),
            resolve: () => new ObjectQueryNode([])
        }));

        const singleRootEntityFields = namespace.rootEntityTypes.map((rootEntityType): QueryNodeField => ({
            name: rootEntityType.name,
            type: this.outputTypeGenerator.generate(rootEntityType),
            args: getArgumentsForUniqueFields(rootEntityType),
            resolve: (_, args) => this.getSingleRootEntity(rootEntityType, args)
        }));

        const allRootEntitiesFields = namespace.rootEntityTypes.map((rootEntityType): QueryNodeField => {
            const fieldConfig = ({
                name: ALL_ENTITIES_FIELD_PREFIX + pluralize(rootEntityType.name),
                type: new QueryNodeNonNullType(new QueryNodeListType(new QueryNodeNonNullType(this.outputTypeGenerator.generate(rootEntityType)))),
                args: {},
                resolve: () => this.getAllRootEntities(rootEntityType)
            });
            return this.listAugmentation.augment(fieldConfig, rootEntityType);
        });

        return {
            name: `${namespace.pascalCasePath}Query`,
            fields: [
                ...namespaceFields,
                ...singleRootEntityFields,
                ...allRootEntitiesFields
            ]
        };
    }

    private getSingleRootEntity(rootEntityType: RootEntityType, args: { [name: string]: any }): QueryNode {
        return new FirstOfListQueryNode(getEntitiesByUniqueFieldQuery(rootEntityType, args));
    }

    private getAllRootEntities(rootEntityType: RootEntityType): QueryNode {
        return new EntitiesQueryNode(rootEntityType);
    }
}
