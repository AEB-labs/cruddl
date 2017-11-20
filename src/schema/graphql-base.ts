import gql from 'graphql-tag';

export const DIRECTIVES = gql`
    # Declares a type for root-level objects with ids that are stored directly in the data base
    directive @rootEntity on OBJECT
    
    # Declares a type for objects with ids that can be embedded as a list within another entity
    directive @childEntity on OBJECT
    
    # Declares a type for objects without id that can be embedded everywhere and can only be replaced as a whole
    directive @valueObject on OBJECT
    
    # Declares a type for objects which can be embedded within entities or entity extensions
    directive @entityExtension on OBJECT
    
    # Declares a field as a to-1 or to-n relation to another root entity
    directive @relation on FIELD_DEFINITION
    
    # Declares a field to reference another root entity via its @key
    directive @reference on FIELD_DEFINITION
    
    # Declares a field as business key which is used in @reference fields
    directive @key on FIELD_DEFINITION
    
    # Specifies the namespace of a type
    directive @namespace(name: String!) on OBJECT
    
    # Specifies the roles that can access objects of this type
    directive @roles(
        # A list of roles that are authorized to read objects of this type
        read: [String!]
        # A list of roles that are authorized to read, create, update and delete objects of this type
        readWrite: [String!])
    on FIELD_DEFINITION|OBJECT

    enum CalcMutationsOperator {
        MULTIPLY,
        DIVIDE,
        ADD,
        SUBTRACT,
        MODULO,
        APPEND,
        PREPEND
    }    
    # Specifies which special calculation update mutations should be generated for this field
    directive @calcMutations(
        # A list of operators. For each operator a update calculation mutation will be generated
        operators: [CalcMutationsOperator!])
    on FIELD_DEFINITION
`;

export const CORE_SCALARS = gql`
    scalar DateTime
    scalar Date
    scalar Time
    scalar JSON
`;
