import { makeExecutableSchema } from '@graphql-tools/schema';
import { IResolvers } from '@graphql-tools/utils';
import { GraphQLResolveInfo, GraphQLSchema } from 'graphql';
import gql from 'graphql-tag';
import { AccessOperation, AuthContext } from '../authorization/auth-basics';
import { PermissionResult } from '../authorization/permission-descriptors';
import {
    getPermissionDescriptorOfField,
    getPermissionDescriptorOfRootEntityType,
} from '../authorization/permission-descriptors-in-model';
import { ExecutionOptionsCallbackArgs } from '../execution/execution-options';
import { EnumValue, Field, RootEntityType, Type, TypeKind } from '../model';
import { OrderDirection } from '../model/implementation/order';
import { Project } from '../project/project';
import { compact, flatMap } from '../utils/utils';
import { I18N_GENERIC, I18N_LOCALE } from './constants';

const resolutionOrderDescription = JSON.stringify(
    'The order in which languages and other localization providers are queried for a localization. You can specify languages as defined in the schema as well as the following special identifiers:\n\n- `_LOCALE`: The language defined by the GraphQL request (might be a list of languages, e.g. ["de_DE", "de", "en"])\n- `_GENERIC`: is auto-generated localization from field and type names (e. G. `orderDate` => `Order date`)\n\nThe default `resolutionOrder` is `["_LOCALE", "_GENERIC"]` (if not specified).',
);

const cruddlVersion = require('../../package.json').version;

const typeDefs = gql`
    enum TypeKind {
        ROOT_ENTITY, CHILD_ENTITY, ENTITY_EXTENSION, VALUE_OBJECT, ENUM, SCALAR
    }

    type Field {
        name: String!
        description: String

        isDeprecated: Boolean!
        deprecationReason: String

        declaringType: ObjectType!

        "Indicates if this field is a list."
        isList: Boolean!

        "Indicates if this field references a root entity by its key field."
        isReference: Boolean!

        "Indicates if this field defines a relation."
        isRelation: Boolean!

        "If \`false\`, this field can not be set in *create* or *update* mutations."
        isReadOnly: Boolean!

        "If \`true\`, this field is defined by the system, otherwise, by the schema."
        isSystemField: Boolean!

        "If \`true\`, this the value of this field is calculated via a collect expression and can not be set."
        isCollectField: Boolean!

        "The type for the field's value"
        type: Type!

        "Relation information, if \`isRelation\` is \`true\`, \`null\` otherwise"
        relation: Relation

        relationDeleteAction: RelationDeleteAction

        "Information about the @collect field configuration, if \`isCollectField\` is \`true\`, \`null\` otherwise"
        collectFieldConfig: CollectFieldConfig

        """
        The field holding the key of the referenced object, if \`isReference\` is true.

        If this is a reference without a dedicated key value field, this is the reference field itself.
        """
        referenceKeyField: Field

        "If \`true\`, this field represents the enclosing child or root entity and cannot be set directly."
        isParentField: Boolean!

        "If \`true\`, this field represents the enclosing root entity and cannot be set directly."
        isRootField: Boolean!

        localization(
            ${resolutionOrderDescription} resolutionOrder: [String]
        ): FieldLocalization

        isFlexSearchIndexed: Boolean!
        isFlexSearchIndexCaseSensitive: Boolean!
        isIncludedInSearch: Boolean!
        isFlexSearchFulltextIndexed: Boolean!
        isFulltextIncludedInSearch: Boolean!
        flexSearchLanguage: FlexSearchLanguage

        permissions: FieldPermissions
    }

    type Index {
        id: String @deprecated(reason: "has no effect, do not use")

        unique: Boolean!
        sparse: Boolean!
        fields: [IndexField!]!
    }

    type IndexField {
        field: Field!
        path: [String!]!
    }

    type Relation {
        fromType: RootEntityType!
        fromField: Field!
        toType: RootEntityType!
        toField: Field
    }

    enum RelationDeleteAction {
        REMOVE_EDGES,
        CASCADE,
        RESTRICT
    }


    type CollectFieldConfig {
        fieldsInPath: [Field!]!
        path: [String!]!
        aggregationOperator: AggregationOperator
    }

    enum AggregationOperator {
        COUNT,
        SOME,
        NONE,

        COUNT_NULL,
        COUNT_NOT_NULL,
        SOME_NULL,
        SOME_NOT_NULL,
        EVERY_NULL,
        NONE_NULL,

        MIN,
        MAX,
        SUM,
        AVERAGE,

        COUNT_TRUE,
        COUNT_NOT_TRUE,
        SOME_TRUE,
        SOME_NOT_TRUE,
        EVERY_TRUE,
        NONE_TRUE,

        DISTINCT,
        COUNT_DISTINCT
    }

    interface Type {
        name: String!
        kind: TypeKind!
        description: String
        localization(
            ${resolutionOrderDescription} resolutionOrder: [String]
        ): TypeLocalization
    }

    interface ObjectType {
        name: String!
        kind: TypeKind!
        description: String
        fields: [Field!]!
        localization(
            ${resolutionOrderDescription} resolutionOrder: [String]
        ): TypeLocalization
    }

    type RootEntityType implements ObjectType & Type {
        name: String!
        "The plural name, as it is used in all* queries and in collection names"
        pluralName: String!
        kind: TypeKind!
        description: String

        "The namespace this type is declared in"
        namespace: Namespace!

        "The field by which objects of this type can be referenced (optional)"
        keyField: Field

        "A list of database indices"
        indices: [Index!]!

        fields: [Field!]!

        isFlexSearchIndexed: Boolean!
        flexSearchPrimarySort: [OrderClause!]!
        "If \`true\`, objects of this type can be searched with flexSearchExpression"
        hasFieldsIncludedInSearch: Boolean!

        """
        All relations between this type and other types

        This also contains relations that are not declared by a field on this type, but by a field on the target type.
        """
        relations: [Relation!]!
        localization(
            ${resolutionOrderDescription} resolutionOrder: [String]
        ): TypeLocalization

        "Indicates if this root entity type is one of the core objects of business transactions"
        isBusinessObject: Boolean

        permissions: RootEntityTypePermissions
    }

    type ChildEntityType implements ObjectType & Type {
        name: String!
        kind: TypeKind!
        description: String
        fields: [Field!]!
        localization(
            ${resolutionOrderDescription} resolutionOrder: [String]
        ): TypeLocalization
    }

    type EntityExtensionType implements ObjectType & Type {
        name: String!
        kind: TypeKind!
        description: String
        fields: [Field!]!
        localization(
            ${resolutionOrderDescription} resolutionOrder: [String]
        ): TypeLocalization
    }

    type ValueObjectType implements ObjectType & Type {
        name: String!
        kind: TypeKind!
        description: String
        fields: [Field!]!
        localization(
            ${resolutionOrderDescription} resolutionOrder: [String]
        ): TypeLocalization
    }

    type ScalarType implements Type {
        name: String!
        kind: TypeKind!
        description: String
        localization(
            ${resolutionOrderDescription} resolutionOrder: [String]
        ): TypeLocalization
    }

    type EnumType implements Type {
        name: String!
        kind: TypeKind!
        description: String
        values: [EnumValue!]!
        localization(
            ${resolutionOrderDescription} resolutionOrder: [String]
        ): TypeLocalization
    }

    type EnumValue {
        value: String!
        description: String
        localization(
            ${resolutionOrderDescription} resolutionOrder: [String]
        ): EnumValueLocalization
    }

    type Namespace {
        "The name of this namespace, i.e., the last path segment"
        name: String

        "The namespace path segments"
        path: [String!]!

        "All root entity types declared directly in this namespace"
        rootEntityTypes: [RootEntityType!]!

        "All direct child namespaces"
        childNamespaces: [Namespace!]!

        "\`true\` if this is the root namespace"
        isRoot: Boolean!
    }

    type TypeLocalization {
        label: String
        labelPlural: String
        hint: String
    }

    type FieldLocalization {
        label: String
        hint: String
    }

    type EnumValueLocalization {
        label: String
        hint: String
    }

    type BillingEntityType {
        typeName: String
        keyFieldName: String
    }

    type OrderClause{
        field: String
        order: OrderDirection
    }

    enum OrderDirection {
        ASC, DESC
    }

    "The available languages for FlexSearch Analyzers"
    enum FlexSearchLanguage {
        EN, DE, ES, FI, FR, IT, NL, NO, PT, RU, SV, ZH
    }

    type FieldPermissions {
        "Simplified view on read permissions (might sometimes be true even if the user cannot read)"
        canRead: Boolean
        "Simplified view on set/update permissions (might sometimes be true even if the user cannot write)"
        canWrite: Boolean
    }

    type RootEntityTypePermissions {
        "Simplified view on read permissions (might sometimes be true even if the user cannot read)"
        canRead: Boolean
        "Simplified view on create permissions (might sometimes be true even if the user cannot or can only conditionally create)"
        canCreate: Boolean
        "Simplified view on update permissions (might sometimes be true even if the user cannot or can only conditionally update)"
        canUpdate: Boolean
        "Simplified view on delete permissions (might sometimes be true even if the user cannot or can only conditionally delete)"
        canDelete: Boolean
    }

    """
    Provides meta information about types and fields

    This differs from the GraphQL introspection types like \`__Schema\` in that it excludes auto-generated types and
    fields like input types or the \`count\` field for lists, and it provides additional type information like type
    kinds and relations.
    
    You can parse the following part of this comment for feature detection (it won't change the format):
    
    cruddlVersion: "${cruddlVersion}"
    """
    type Query {
        "A list of all user-defined and system-provided types"
        types: [Type!]!

        "Finds a type by its name"
        type(name: String!): Type

        "A list of all root entity types in all namespaces"
        rootEntityTypes: [RootEntityType!]!

        """
        Finds a root entity type by its name.

        Returns \`null\` if the type does not exist or is not a root entity type.
        """
        rootEntityType(name: String!): RootEntityType

        "A list of all child entity types"
        childEntityTypes: [ChildEntityType!]!

        """
        Finds a child entity type by its name.

        Returns \`null\` if the type does not exist or is not a child entity type.
        """
        childEntityType(name: String!): ChildEntityType

        "A list of all entity extension types"
        entityExtensionTypes: [EntityExtensionType!]!

        """
        Finds an entity extension type by its name.

        Returns \`null\` if the type does not exist or is not an entity extension type.
        """
        entityExtensionType(name: String!): EntityExtensionType

        "A list of all value object types"
        valueObjectTypes: [ValueObjectType!]!

        """
        Finds a value object type by its name.

        Returns \`null\` if the type does not exist or is not a value object type.
        """
        valueObjectType(name: String!): ValueObjectType

        "A list of all scalar types, including predefined ones."
        scalarTypes: [ScalarType!]!

        """
        Finds a scalar type by its name.

        Returns \`null\` if the type does not exist or is not a scalar type.
        """
        scalarType(name: String!): ScalarType

        "A list of all enum types"
        enumTypes: [EnumType!]!

        """
        Finds an enum type by its name.

        Returns \`null\` if the type does not exist or is not an enum type.
        """
        enumType(name: String!): EnumType

        "A list of all namespaces (including nested ones)"
        namespaces: [Namespace!]!

        """Finds a namespace by its path segments"""
        namespace("The path segments, e.g. \`[\\"logistics\\", \\"packaging\\"]\`" path: [String!]!): Namespace

        "The root namespace"
        rootNamespace: Namespace!

        "The billingEntityTypes that define the billing configuration."
        billingEntityTypes: [BillingEntityType!]!

        """
        The version of cruddl, the library serving the schema
    
        Equals the npm package version and follows semantic versioning. You can use this to test for
        support for schema features.
        """
        cruddlVersion: String
    }

    type Subscription {
        schema: Schema
    }

    """
    Provides meta information about types and fields

    This differs from the GraphQL introspection types like \`__Schema\` in that it excludes auto-generated types and
    fields like input types or the \`count\` field for lists, and it provides additional type information like type
    kinds and relations.
    """
    type Schema {
        "A list of all user-defined and system-provided types"
        types: [Type!]!

        "Finds a type by its name"
        type(name: String!): Type

        "A list of all root entity types in all namespaces"
        rootEntityTypes: [RootEntityType!]!

        """
        Finds a root entity type by its name.

        Returns \`null\` if the type does not exist or is not a root entity type.
        """
        rootEntityType(name: String!): RootEntityType

        "A list of all child entity types"
        childEntityTypes: [ChildEntityType!]!

        """
        Finds a child entity type by its name.

        Returns \`null\` if the type does not exist or is not a child entity type.
        """
        childEntityType(name: String!): ChildEntityType

        "A list of all entity extension types"
        entityExtensionTypes: [EntityExtensionType!]!

        """
        Finds an entity extension type by its name.

        Returns \`null\` if the type does not exist or is not an entity extension type.
        """
        entityExtensionType(name: String!): EntityExtensionType

        "A list of all value object types"
        valueObjectTypes: [ValueObjectType!]!

        """
        Finds a value object type by its name.

        Returns \`null\` if the type does not exist or is not a value object type.
        """
        valueObjectType(name: String!): ValueObjectType

        "A list of all scalar types, including predefined ones."
        scalarTypes: [ScalarType!]!

        """
        Finds a scalar type by its name.

        Returns \`null\` if the type does not exist or is not a scalar type.
        """
        scalarType(name: String!): ScalarType

        "A list of all enum types"
        enumTypes: [EnumType!]!

        """
        Finds an enum type by its name.

        Returns \`null\` if the type does not exist or is not an enum type.
        """
        enumType(name: String!): EnumType

        "A list of all namespaces (including nested ones)"
        namespaces: [Namespace!]!

        """Finds a namespace by its path segments"""
        namespace("The path segments, e.g. \`[\\"logistics\\", \\"packaging\\"]\`" path: [String!]!): Namespace

        "The root namespace"
        rootNamespace: Namespace!

        "The billingEntityTypes that define the billing configuration."
        billingEntityTypes: [BillingEntityType!]!
    
        """
        The version of cruddl, the library serving the schema
        
        Equals the npm package version and follows semantic versioning. You can use this to test for
        support for schema features.
        """
        cruddlVersion: String
    }
`;

/**
 * Returns an executable GraphQLSchema which allows to query the meta schema of the given model.
 * Allows to query the different kinds of types and entities, their fields, indices, uniqueness, ...
 */
export function getMetaSchema(project: Project): GraphQLSchema {
    const model = project.getModel();
    const resolvers: IResolvers<{}, { locale: string }> = {
        Query: {
            types: () => model.types,
            type: (_, { name }) => model.getType(name),
            rootEntityTypes: () => model.rootEntityTypes,
            rootEntityType: (_, { name }) => model.getRootEntityType(name),
            childEntityTypes: () => model.childEntityTypes,
            childEntityType: (_, { name }) => model.getChildEntityType(name),
            entityExtensionTypes: () => model.entityExtensionTypes,
            entityExtensionType: (_, { name }) => model.getEntityExtensionType(name),
            valueObjectTypes: () => model.valueObjectTypes,
            valueObjectType: (_, { name }) => model.getValueObjectType(name),
            scalarTypes: () => model.scalarTypes,
            scalarType: (_, { name }) => model.getScalarType(name),
            enumTypes: () => model.enumTypes,
            enumType: (_, { name }) => model.getEnumType(name),
            namespaces: () => model.namespaces,
            rootNamespace: () => model.rootNamespace,
            namespace: (_, { path }) => model.getNamespaceByPath(path),
            billingEntityTypes: () => model.billingEntityTypes,
            cruddlVersion: () => cruddlVersion,
        },
        // to be used within the subscription type, so we don't use the "Query" type there in case we want to add something there
        Schema: {
            types: () => model.types,
            type: (_, { name }) => model.getType(name),
            rootEntityTypes: () => model.rootEntityTypes,
            rootEntityType: (_, { name }) => model.getRootEntityType(name),
            childEntityTypes: () => model.childEntityTypes,
            childEntityType: (_, { name }) => model.getChildEntityType(name),
            entityExtensionTypes: () => model.entityExtensionTypes,
            entityExtensionType: (_, { name }) => model.getEntityExtensionType(name),
            valueObjectTypes: () => model.valueObjectTypes,
            valueObjectType: (_, { name }) => model.getValueObjectType(name),
            scalarTypes: () => model.scalarTypes,
            scalarType: (_, { name }) => model.getScalarType(name),
            enumTypes: () => model.enumTypes,
            enumType: (_, { name }) => model.getEnumType(name),
            namespaces: () => model.namespaces,
            rootNamespace: () => model.rootNamespace,
            namespace: (_, { path }) => model.getNamespaceByPath(path),
            billingEntityTypes: () => model.billingEntityTypes,
            cruddlVersion: () => cruddlVersion,
        },
        Subscription: {
            schema: {
                resolve: (a) => a,
                subscribe: async function* subscribeToSchema() {
                    yield {};
                    await new Promise((resolve) => {}); /* never resolve */
                },
            },
        },
        Type: {
            __resolveType: (type: unknown) => resolveType(type as Type),
        },
        ObjectType: {
            __resolveType: (type: unknown) => resolveType(type as Type),
        },
        RootEntityType: {
            localization: localizeType,
            flexSearchPrimarySort: getFlexSearchPrimarySort,
            permissions: getRootEntityTypePermissions,
        },
        ChildEntityType: {
            localization: localizeType,
        },
        EntityExtensionType: {
            localization: localizeType,
        },
        ValueObjectType: {
            localization: localizeType,
        },
        ScalarType: {
            localization: localizeType,
        },
        EnumType: {
            localization: localizeType,
        },
        Field: {
            localization: localizeField,
            collectFieldConfig: (field: unknown) => {
                if (!(field instanceof Field) || !field.collectPath) {
                    return undefined;
                }
                return {
                    path: field.collectPath.segments.map((s) => s.field.name),
                    fieldsInPath: field.collectPath.segments.map((s) => s.field),
                    aggregationOperator: field.aggregationOperator,
                };
            },
            permissions: getFieldPermissions,
        },
        EnumValue: {
            localization: localizeEnumValue,
        },
    };

    function getResolutionOrder(
        resolutionOrder: ReadonlyArray<string> | undefined,
        contextArgs: ExecutionOptionsCallbackArgs,
    ) {
        // default resolutionOrder
        if (!resolutionOrder) {
            resolutionOrder = [I18N_LOCALE, I18N_GENERIC];
        }
        // replace _LOCALE
        return compact(
            flatMap(resolutionOrder, (l) =>
                l === I18N_LOCALE ? getLocaleFromContext(contextArgs) : [l],
            ),
        );
    }

    function localizeType(
        type: {},
        { resolutionOrder }: { resolutionOrder?: ReadonlyArray<string> },
        context: unknown,
        info: GraphQLResolveInfo,
    ) {
        return model.i18n.getTypeLocalization(
            type as Type,
            getResolutionOrder(resolutionOrder, { context, operationDefinition: info.operation }),
        );
    }

    function localizeField(
        field: {},
        { resolutionOrder }: { resolutionOrder?: ReadonlyArray<string> },
        context: unknown,
        info: GraphQLResolveInfo,
    ) {
        return model.i18n.getFieldLocalization(
            field as Field,
            getResolutionOrder(resolutionOrder, { context, operationDefinition: info.operation }),
        );
    }

    function localizeEnumValue(
        enumValue: {},
        { resolutionOrder }: { resolutionOrder?: ReadonlyArray<string> },
        context: unknown,
        info: GraphQLResolveInfo,
    ) {
        return model.i18n.getEnumValueLocalization(
            enumValue as EnumValue,
            getResolutionOrder(resolutionOrder, { context, operationDefinition: info.operation }),
        );
    }

    function getFlexSearchPrimarySort(type: {}): { field: string; order: 'ASC' | 'DESC' }[] {
        const rootEntityType = type as RootEntityType;
        return rootEntityType.flexSearchPrimarySort.map((value) => {
            return {
                field: value.field.path,
                order: value.direction === OrderDirection.ASCENDING ? 'ASC' : 'DESC',
            };
        });
    }

    function getLocaleFromContext(
        contextArgs: ExecutionOptionsCallbackArgs,
    ): ReadonlyArray<string> {
        if (!project.options.getExecutionOptions) {
            return [];
        }
        const executionOptions = project.options.getExecutionOptions(contextArgs);
        return executionOptions?.locale?.acceptLanguages ?? [];
    }

    function getFieldPermissions(
        field: Field,
        args: unknown,
        context: unknown,
        info: GraphQLResolveInfo,
    ) {
        const options = project.options.getExecutionOptions?.({
            context,
            operationDefinition: info.operation,
        });
        if (!options) {
            return null;
        }
        if (options.disableAuthorization) {
            return {
                canRead: true,
                canWrite: true,
            };
        }

        // one additional check that is normally done indirectly
        if (field.type.isRootEntityType && field.type !== field.declaringType) {
            const descriptor = getPermissionDescriptorOfRootEntityType(field.type);
            // be optimistic on CONDITIONAL types
            if (
                descriptor.canAccess(options.authContext ?? {}, AccessOperation.READ) ===
                PermissionResult.DENIED
            ) {
                return {
                    canRead: false,
                    canWrite: false,
                };
            }
        }

        const descriptor = getPermissionDescriptorOfField(field);
        const authContext = options.authContext ?? {};
        return {
            canRead:
                descriptor.canAccess(options.authContext ?? {}, AccessOperation.READ) ===
                PermissionResult.GRANTED,
            canWrite:
                descriptor.canAccess(authContext, AccessOperation.UPDATE) ===
                PermissionResult.GRANTED,
        };
    }

    function getRootEntityTypePermissions(
        rootEntityType: RootEntityType,
        args: unknown,
        context: unknown,
        info: GraphQLResolveInfo,
    ) {
        const options = project.options.getExecutionOptions?.({
            context,
            operationDefinition: info.operation,
        });
        if (!options) {
            return null;
        }
        if (options.disableAuthorization) {
            return {
                canRead: true,
                canCreate: true,
                canUpdate: true,
                canDelete: true,
            };
        }

        const descriptor = getPermissionDescriptorOfRootEntityType(rootEntityType);
        const authContext = options.authContext ?? {};
        return {
            canRead:
                descriptor.canAccess(authContext, AccessOperation.READ) ===
                PermissionResult.GRANTED,
            canCreate:
                descriptor.canAccess(authContext, AccessOperation.CREATE) ===
                PermissionResult.GRANTED,
            canUpdate:
                descriptor.canAccess(authContext, AccessOperation.UPDATE) ===
                PermissionResult.GRANTED,
            canDelete:
                descriptor.canAccess(authContext, AccessOperation.DELETE) ===
                PermissionResult.GRANTED,
        };
    }

    return makeExecutableSchema({
        typeDefs,
        resolvers,
    });
}

function resolveType(type: Type): string {
    switch (type.kind) {
        case TypeKind.ROOT_ENTITY:
            return 'RootEntityType';
        case TypeKind.CHILD_ENTITY:
            return 'ChildEntityType';
        case TypeKind.ENTITY_EXTENSION:
            return 'EntityExtensionType';
        case TypeKind.VALUE_OBJECT:
            return 'ValueObjectType';
        case TypeKind.ENUM:
            return 'EnumType';
        case TypeKind.SCALAR:
            return 'ScalarType';
        default:
            return 'ScalarType';
    }
}
