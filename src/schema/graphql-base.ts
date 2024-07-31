import { DocumentNode } from 'graphql';
import gql from 'graphql-tag';

export const DIRECTIVES: DocumentNode = gql`
    "Declares a type for root-level objects with ids that are stored directly in the data base"
    directive @rootEntity(
        indices: [IndexDefinition!]
        permissionProfile: String
        flexSearch: Boolean = false
        flexSearchLanguage: FlexSearchLanguage = EN
        flexSearchOrder: [FlexSearchOrderArgument!] = []

        flexSearchPerformanceParams: FlexSearchPerformanceParams
    ) on OBJECT

    "Bundles non-functional, optional parameters for flexsearch performance optimizations"
    input FlexSearchPerformanceParams {
        "The time in milliseconds after which data changes will be visible in flexSearch queries"
        commitIntervalMsec: Int

        "The interval at which a consolidation policy is applied to the flexSearch view"
        consolidationIntervalMsec: Int

        "Wait at least this many commits before removing unused files in the data directory"
        cleanupIntervalStep: Int
    }

    "Declares a type for objects with ids that can be embedded as a list within another entity"
    directive @childEntity(flexSearchLanguage: FlexSearchLanguage = EN) on OBJECT

    "Declares a type for objects without id that can be embedded everywhere and can only be replaced as a whole"
    directive @valueObject(flexSearchLanguage: FlexSearchLanguage = EN) on OBJECT

    "Declares a type for objects which can be embedded within entities or entity extensions"
    directive @entityExtension(flexSearchLanguage: FlexSearchLanguage = EN) on OBJECT

    "Declares a field as a to-1 or to-n relation to another root entity"
    directive @relation(
        "Specify the name of a relation field on the target type to make this the inverse direction of the same relation"
        inverseOf: String

        "Specifies what should happen if the root entity defining this relation is deleted. Can not be specified on inverse relations"
        onDelete: RelationDeleteAction
    ) on FIELD_DEFINITION

    enum RelationDeleteAction {
        "Specifies that only the affected edges should be deleted. This is the default behavior."
        REMOVE_EDGES

        "Specifies that the related entity or entities should be automatically deleted when this root entity is deleted (will be applied recursively)"
        CASCADE

        "Specifies that this root entity cannot be deleted while there are related entities"
        RESTRICT
    }

    "Collects values by traversing a path and optionally aggregating them"
    directive @collect(
        """
        A series of field names (dot-separated), starting from the declaring type.

        Recursive relation fields (e.g. from HandlingUnit to HandlingUnit) can be traversed recursively. To enable this,
        specify a minimum and maximum depth, e.g. "children{1,3}" to include all direct children, their children, and
        the children of them. You can also specify zero as lower bound to include the originating entity.
        """
        path: String!

        "An optional operator to be used to aggregate the values"
        aggregate: FieldAggregator
    ) on FIELD_DEFINITION

    enum FieldAggregator {
        "Total number of items (including null)"
        COUNT
        "true if there are any items (including null)"
        SOME
        "true if the list is empty"
        NONE

        "Number of items that are null"
        COUNT_NULL
        "Number of items that are not null"
        COUNT_NOT_NULL
        "true if there are items that are null"
        SOME_NULL
        "true if there are items that are not null"
        SOME_NOT_NULL
        "true if there are no items that are not null"
        EVERY_NULL
        "true if there are no items that are null"
        NONE_NULL

        "Minimum value (ignoring null)"
        MIN
        "Maximum value (ignoring null)"
        MAX
        "Sum (ignoring null)"
        SUM
        "Sum / Count (ignoring null)"
        AVERAGE

        "Number of items that are true"
        COUNT_TRUE
        "Number of items that are not true"
        COUNT_NOT_TRUE
        "true if there are items that are true"
        SOME_TRUE
        "true if there are items that are not true"
        SOME_NOT_TRUE
        "true if there are no items that are not true"
        EVERY_TRUE
        "true if there are no items that are true"
        NONE_TRUE

        "Removes duplicate items and null values"
        DISTINCT

        "Counts the number of items without duplicates and null values"
        COUNT_DISTINCT
    }

    "Declares a field to reference another root entity via its @key"
    directive @reference(
        """
        The field (within the same type declaration) that contains the reference key

        If this argument is not specified, the key will not be accessible via the GraphQL API, and an implicit key field called like this reference field will be used to hold the key in the database.
        """
        keyField: String
    ) on FIELD_DEFINITION

    """
    Declares a field of a child entity to hold the parent entity.

    The value of this field cannot be set and is determined automatically. It is only available if a child entity is used in exactly one entity type, and the type of this field must be that type. If the child entity is used within an entity extension, the type of this field should be the closest root or child entity type using the entity extension.
    """
    directive @parent on FIELD_DEFINITION

    """
    Declares a field of a child entity to hold the root entity that contains this child entity.

    The value of this field cannot be set and is determined automatically. It is only available if a child entity is used in exactly one root entity type, and the type of this field must be that type. If the child entity is used within another child entity type or an entity extension type, the type of this field should be the root entity type using those types.
    """
    directive @root on FIELD_DEFINITION

    "Declares a field as business key which is used in @reference fields"
    directive @key on FIELD_DEFINITION

    "Declares a field to be indexed"
    directive @index(sparse: Boolean = false) on FIELD_DEFINITION

    "Declares a field to be indexed with FlexSearch"
    directive @flexSearch(
        includeInSearch: Boolean = false
        caseSensitive: Boolean = true
    ) on FIELD_DEFINITION

    "Declares a field to be indexed with FlexSearch with a Text Analyzer"
    directive @flexSearchFulltext(
        language: FlexSearchLanguage
        includeInSearch: Boolean = false
    ) on FIELD_DEFINITION

    "The available languages for FlexSearch Analyzers"
    enum FlexSearchLanguage {
        EN
        DE
        ES
        FI
        FR
        IT
        NL
        NO
        PT
        RU
        SV
        ZH
    }

    "An argument to define the order of a flexSearchIndex"
    input FlexSearchOrderArgument {
        field: String!
        direction: OrderDirection
    }

    enum OrderDirection {
        ASC
        DESC
    }

    "Declares a field to be unique-indexed"
    directive @unique(sparse: Boolean = true) on FIELD_DEFINITION

    "Specifies the namespace of a type"
    directive @namespace(name: String!) on OBJECT

    "Specifies the roles that can access objects of this type"
    directive @roles(
        "A list of roles that are authorized to read objects of this type"
        read: [String!]
        "A list of roles that are authorized to read, create, update and delete objects of this type"
        readWrite: [String!]
    ) on FIELD_DEFINITION | OBJECT

    "Specifies the indices of a root entity"
    directive @indices(indices: [IndexDefinition!]) on OBJECT

    enum CalcMutationsOperator {
        MULTIPLY
        DIVIDE
        ADD
        SUBTRACT
        MODULO
        APPEND
        PREPEND
    }
    "Specifies which special calculation update mutations should be generated for this field"
    directive @calcMutations(
        "A list of operators. For each operator a update calculation mutation will be generated"
        operators: [CalcMutationsOperator!]
    ) on FIELD_DEFINITION

    ""
    directive @defaultValue(value: JSON!) on FIELD_DEFINITION

    input IndexDefinition {
        "Deprecated, has no effect. Do not use."
        id: String
        fields: [String!]!
        unique: Boolean = false

        """
        If set to true, the index will not contain any values where one of the fields is null.

        If unspecified, the value depends on unique: unique indices default to sparse, non-unique indices default to non-sparse.
        """
        sparse: Boolean
    }

    "Declares a root entity type to be one of the core objects of business transactions"
    directive @businessObject on OBJECT

    "Annotates a field so it can be used within restrictions of a permission profile"
    directive @accessField on FIELD_DEFINITION

    """
    Marks this field as hidden in the meta schema so it will not be listed in generic UIs
    """
    directive @hidden on FIELD_DEFINITION

    """
    Assigns this type or field to modules
    """
    directive @modules(
        """
        A list of modules this type or field should be part of.

        Can be an expression like module1 && module2.

        Can include modules that are not listed in the declaring type.
        """
        in: [String!]

        "Specifies that this field should be included in all modules that include the declaring type."
        all: Boolean

        "Specifies that all fields in this type should be included in all modules declared on this type."
        includeAllFields: Boolean
    ) on OBJECT | ENUM | FIELD_DEFINITION
`;

export const CORE_SCALARS: DocumentNode = gql`
    """
    The \`DateTime\` scalar type represents a point in time in UTC, in a format specified by ISO 8601, such as \`2007-12-03T10:15:30Z\` or \`2007-12-03T10:15:30.123Z\`.

    This scalar type rejects values without timezone specifier or with a timezone other than UTC. See also \`LocalDate\` and \`LocalTime\` for values without timezone specifier. To store Date/time values with timezones other than UTC, define a value object type with the fields you need.

    The *second* part is added if not specified, e.g. \`2007-12-03T12:34Z\` is converted to \`2007-12-03T12:34:00Z\`. Second fraction digits are cut off at the nearest three-digit group, e.g. \`2007-12-03T00:00:00.1234Z\` is converted to \`2007-12-03T00:00:00.123400Z\`.

    Values with leap seconds are shifted back by one second, but this behavior should not be relied upon.
    """
    scalar DateTime

    """
    The \`LocalDate\` scalar type represents a date without time zone in a format specified by ISO 8601, such as 2007-12-03.
    """
    scalar LocalDate

    """
    The \`LocalTime\` scalar type represents a time without time zone in a format specified by ISO 8601, such as 10:15:30 or 17:05:03.521.

    The valid range is between 00:00:00 and 23:59:59.999999999. 24:00 is not allowed to avoid bugs in clients that treat 24:00 as 0:00.

    The seconds part is cut off if it is zero, e.g. 12:34:00 is converted to 12:34. Second fraction digits are cut off at the nearest three-digit group, e.g. 00:00:00.1234 is converted to 00:00:00.123400.

    Leap seconds can not be specified.
    """
    scalar LocalTime

    """
    The \`OffsetDateTime\` scalar type represents a point in time with a timezone offset, in a format specified by ISO 8601, such as \`2007-12-03T10:15:30+01:00\` or \`2007-12-03T10:15:30.123Z\`.

    Only use this type for timestamps that are inherently tied to a location and the timezone offset should be calculated eagerly. To only store a point in time, use \`DateTime\`.

    The *second* part is added if not specified, e.g. \`2007-12-03T12:34Z\` is converted to \`2007-12-03T12:34:00Z\`. Offset specifier \`Z\` is accepted but will be converted to \`+00:00\`. Leap seconds are not supported.
    """
    scalar OffsetDateTime

    """
    The \`JSON\` scalar type represents an arbitrary JSON value. This can be a string, number, boolean, array, or object.

    Values are *not* additionally JSON-encoded or JSON-parsed, so e.g. pass a raw JSON object here instead of a JSON-representation of that object.
    """
    scalar JSON

    """
    The \`JSONObject\` scalar type represents a JSON object type with arbitrary properties.

    This is similar to the \`JSON\` scalar type but disallows arrays, strings, numbers, and booleans.

    Values are *not* additionally JSON-encoded or JSON-parsed, so e.g. pass a raw JSON object here instead of a JSON-representation of that object.
    """
    scalar JSONObject

    """
    The "StringMap" scalar type consists of a JSON object with only strings as values.

    This type can be used for key-value mappings where fetching keys without values or values without keys does not make sense. For arbitrary maps, the "JSONObject" type can be used instead.

    Values are *not* additionally JSON-encoded or JSON-parsed, so e.g. pass a raw JSON object here instead of a JSON-representation of that object.
    """
    scalar StringMap

    """
    The "I18nString" scalar type represents an internationalized string.

    Structurally, the "I18nString\`" type is equivalent to the "StringMap" type. Keys are ISO 639-1 language codes, and values are the localized strings. In the future, more specific features may be added to this type, so it is preferred over the "StringMap" type to represent internationalized strings.

    Values are *not* additionally JSON-encoded or JSON-parsed, so e.g. pass a raw JSON object here instead of a JSON-representation of that object.
    """
    scalar I18nString

    """
    The Int53 scalar type represents non-fractional signed whole numeric values. Int53 can represent values between -(2^53) and 2^53 - 1.

    Values of this type are serialized as numbers in GraphQL and JSON representations. The numeric range of this type corresponds to the safe integer range of an IEEE 754 double precision binary floating-point value.
    """
    scalar Int53

    """
    The Decimal1 scalar type represents signed numeric values with up to 1 decimal digit. Decimal1 can represent values between -1000000000.0 and 1000000000.0.

    Values of this type are serialized as numbers in GraphQL and JSON representations. The value is always rounded to 1 decimal digit.
    """
    scalar Decimal1

    """
    The Decimal2 scalar type represents signed numeric values with up to 2 decimal digits. Decimal2 can represent values between -1000000000.00 and 1000000000.00.

    Values of this type are serialized as numbers in GraphQL and JSON representations. The value is always rounded to 2 decimal digits.
    """
    scalar Decimal2

    """
    The Decimal3 scalar type represents signed numeric values with up to 3 decimal digits. Decimal3 can represent values between -1000000000.000 and 1000000000.000.

    Values of this type are serialized as numbers in GraphQL and JSON representations. The value is always rounded to 3 decimal digits.
    """
    scalar Decimal3
`;
