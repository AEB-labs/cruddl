export const defaultModelDefTypes = `
        scalar DateTime
   
        type EntityMeta {
            createdAt: DateTime!
            updatedAt: DateTime!
            createdBy: User
        }
        
        type User @Entity {
            name: String!
        }
    `;

export const ENTITY_DIRECTIVE = 'entity';
export const EMBEDDABLE_DIRECTIVE = 'embeddable';
export const RELATION_DIRECTIVE = 'relation';
export const REFERENCE_DIRECTIVE = 'reference';

export const ID_FIELD = 'id';
export const ID_TYPE = 'ID';

export const ENTITY_CREATED_AT = 'createdAt';
export const ENTITY_UPDATED_AT = 'updatedAt';

export const SCALAR_DATETIME = 'DateTime';
export const SCALAR_DATE = 'Date';
export const SCALAR_TIME = 'Time';

export const ENTITY_ID = 'id';

export const ARGUMENT_AND = 'AND';
export const ARGUMENT_OR = 'OR';
export const ARGUMENT_NOT = 'NOT';

export const FILTER_ARG = 'filter';
export const ORDER_BY_ARG = 'orderBy'
