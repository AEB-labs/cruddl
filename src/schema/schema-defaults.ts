export const defaultModelDefTypes = `
        scalar DateTime
   
        type EntityMeta {
            createdAt: DateTime!
            updatedAt: DateTime!
            createdBy: User
        }
        
        type User @rootEntity {
            name: String!
        }
    `;

export const ROOT_ENTITY_DIRECTIVE = 'rootEntity';
export const CHILD_ENTITY_DIRECTIVE = 'childEntity';
export const ENTITY_EXTENSION_DIRECTIVE = 'entityExtension';
/**
 * Value object according to DDD. Some people know this kind of type as Composite.
 */
export const VALUE_OBJECT_DIRECTIVE = 'valueObject';

export const RELATION_DIRECTIVE = 'relation';
export const REFERENCE_DIRECTIVE = 'reference';

export const QUERY_TYPE = 'Query';
export const MUTATION_TYPE = 'Mutation';
export const QUERY_META_TYPE = '_QueryMeta';

export const ALL_ENTITIES_FIELD_PREFIX = 'all';
export const CREATE_ENTITY_FIELD_PREFIX = 'create';
export const UPDATE_ENTITY_FIELD_PREFIX = 'update';
export const DELETE_ENTITY_FIELD_PREFIX = 'delete';
export const ADD_CHILD_ENTITIES_FIELD_PREFIX = 'add';
export const UPDATE_CHILD_ENTITIES_FIELD_PREFIX = 'update';
export const REMOVE_CHILD_ENTITIES_FIELD_PREFIX = 'remove';

export const ID_FIELD = 'id';
export const ID_TYPE = 'ID';

export const ENTITY_CREATED_AT = 'createdAt';
export const ENTITY_UPDATED_AT = 'updatedAt';

export const SCALAR_DATETIME = 'DateTime';
export const SCALAR_DATE = 'Date';
export const SCALAR_TIME = 'Time';
export const SCALAR_JSON = 'JSON';

export const ENTITY_ID = 'id';

export const ARGUMENT_AND = 'AND';
export const ARGUMENT_OR = 'OR';
export const ARGUMENT_NOT = 'NOT';

export const ORDER_BY_ASC_SUFFIX = '_ASC';
export const ORDER_BY_DESC_SUFFIX = '_DESC';

export const FILTER_ARG = 'filter';
export const ORDER_BY_ARG = 'orderBy';

export const CURSOR_FIELD = '_cursor';
export const AFTER_ARG = 'after';
export const FIRST_ARG = 'first';
export const KEY_FIELD_DIRECTIVE = 'key';

export const COUNT_META_FIELD = 'count';

export const MUTATION_INPUT_ARG = 'input';
export const MUTATION_ID_ARG = 'id';

export const ROLES_DIRECTIVE = 'roles';
export const ROLES_READ_ARG = 'read';
export const ROLES_READ_WRITE_ARG = 'readWrite';

export const OBJECT_TYPE_ENTITY_DIRECTIVES = [ROOT_ENTITY_DIRECTIVE, CHILD_ENTITY_DIRECTIVE, ENTITY_EXTENSION_DIRECTIVE, VALUE_OBJECT_DIRECTIVE];

export const NAMESPACE_DIRECTIVE = 'namespace';
export const NAMESPACE_NAME_ARG = 'name';
export const NAMESPACE_SEPARATOR = '.';
export const NAMESPACE_FIELD_PATH_DIRECTIVE = 'namespaceFieldPath';

export const ALL_FIELD_DIRECTIVES = [KEY_FIELD_DIRECTIVE, RELATION_DIRECTIVE, REFERENCE_DIRECTIVE, ROLES_DIRECTIVE];
export const ALL_OBJECT_TYPE_DIRECTIVES = [
    ROOT_ENTITY_DIRECTIVE,
    CHILD_ENTITY_DIRECTIVE,
    ENTITY_EXTENSION_DIRECTIVE,
    VALUE_OBJECT_DIRECTIVE,
    NAMESPACE_DIRECTIVE,
    ROLES_DIRECTIVE,
];

export const MUTATION_FIELD = 'mutation';