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

export const ENTITY_DIRECTIVE = 'Entity';
export const RELATION_DIRECTIVE = 'Relation';
export const REFERENCE_DIRECTIVE = 'Reference';

export const ID_FIELD = 'id';
export const ID_TYPE = 'ID';

export const ENTITY_CREATED_AT = 'createdAt';
export const ENTITY_UPDATED_AT = 'updatedAt';

export const DATETIME = 'DateTime';

export const ENTITY_ID = 'id';