import gql from 'graphql-tag';
import { DocumentNode } from 'graphql';

export const DIRECTIVES: DocumentNode = gql`
    "Declares a type for root-level objects with ids that are stored directly in the data base"
    directive @rootEntity(indices: [IndexDefinition!], permissionProfile: String) on OBJECT
    
    "Declares a type for objects with ids that can be embedded as a list within another entity"
    directive @childEntity on OBJECT
    
    "Declares a type for objects without id that can be embedded everywhere and can only be replaced as a whole"
    directive @valueObject on OBJECT
    
    "Declares a type for objects which can be embedded within entities or entity extensions"
    directive @entityExtension on OBJECT
    
    "Declares a field as a to-1 or to-n relation to another root entity"
    directive @relation(inverseOf: String) on FIELD_DEFINITION
    
    "Declares a field to reference another root entity via its @key"
    directive @reference(
        """
        The field (within the same type declaration) that contains the reference key
        
        If this argument is not specified, the key will not be accessible via the GraphQL API, and an implicit key field called like this reference field will be used to hold the key in the database.
        """
        keyField: String
    ) on FIELD_DEFINITION
    
    "Declares a field as business key which is used in @reference fields"
    directive @key on FIELD_DEFINITION

    "Declares a field to be indexed"
    directive @index(sparse: Boolean = false) on FIELD_DEFINITION

    "Declares a field to be unique-indexed"
    directive @unique(sparse: Boolean = true) on FIELD_DEFINITION

    "Specifies the namespace of a type"
    directive @namespace(name: String!) on OBJECT
    
    "Specifies the roles that can access objects of this type"
    directive @roles(
        "A list of roles that are authorized to read objects of this type"
        read: [String!]
        "A list of roles that are authorized to read, create, update and delete objects of this type"
        readWrite: [String!])
    on FIELD_DEFINITION|OBJECT

    "Specifies the indices of a root entity"
    directive @indices(
            indices: [IndexDefinition!]
        )
    on OBJECT
    
    enum CalcMutationsOperator {
        MULTIPLY,
        DIVIDE,
        ADD,
        SUBTRACT,
        MODULO,
        APPEND,
        PREPEND
    }    
    "Specifies which special calculation update mutations should be generated for this field"
    directive @calcMutations(
        "A list of operators. For each operator a update calculation mutation will be generated"
        operators: [CalcMutationsOperator!])
    on FIELD_DEFINITION

    ""
    directive @defaultValue(value: JSON!) on FIELD_DEFINITION
    
    input IndexDefinition {
        id: String,
        fields: [String!]!
        unique: Boolean = false
        
        """
        If set to true, the index will not contain any values where one of the fields is null.
        
        If unspecified, the value depends on unique: unique indices default to sparse, non-unique indices default to non-sparse.
        """
        sparse: Boolean
    }
`;

export const CORE_SCALARS: DocumentNode = gql`
    scalar DateTime
    scalar LocalDate
    scalar LocalTime
    scalar JSON
`;
