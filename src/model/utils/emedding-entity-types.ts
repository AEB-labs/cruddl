import { ChildEntityType, Model, Type } from '../implementation';

export function collectEmbeddingEntityTypes(
    type: ChildEntityType
): {
    readonly embeddingEntityTypes: ReadonlySet<Type>;
    readonly otherEmbeddingTypes: ReadonlySet<Type>;
} {
    const embeddingEntityTypes = new Set<Type>();
    const otherEmbeddingTypes = new Set<Type>([]);
    let currentTypes = new Set<Type>([type]);
    do {
        const newTypes = new Set<Type>();
        for (const type of currentTypes) {
            const embeddingTypes: ReadonlyArray<Type> = type.model.types.filter(
                t =>
                    t.isObjectType &&
                    t.fields.some(f => f.type === type && !f.isParentField && !f.isRootField && !f.isCollectField)
            );
            for (const type of embeddingTypes) {
                if (type.isChildEntityType || type.isRootEntityType) {
                    // this is a leaf in the execution tree - we don't go upwards on entity types
                    embeddingEntityTypes.add(type);
                } else {
                    // for other types, we continue crawl upwards. Make sure we don't process any type twice.
                    if (!otherEmbeddingTypes.has(type)) {
                        otherEmbeddingTypes.add(type);
                        newTypes.add(type);
                    }
                }
            }
        }
        currentTypes = newTypes;
    } while (currentTypes.size);

    return {
        embeddingEntityTypes,
        otherEmbeddingTypes
    };
}

export function collectEmbeddingRootEntityTypes(
    type: ChildEntityType
): {
    readonly embeddingRootEntityTypes: ReadonlySet<Type>;
    readonly otherEmbeddingTypes: ReadonlySet<Type>;
} {
    const embeddingRootEntityTypes = new Set<Type>();
    const otherEmbeddingTypes = new Set<Type>([]);
    let currentTypes = new Set<Type>([type]);
    do {
        const newTypes = new Set<Type>();
        for (const type of currentTypes) {
            const embeddingTypes: ReadonlyArray<Type> = type.model.types.filter(
                t =>
                    t.isObjectType &&
                    t.fields.some(f => f.type === type && !f.isParentField && !f.isRootField && !f.isCollectField)
            );
            for (const type of embeddingTypes) {
                if (type.isRootEntityType) {
                    // this is a leaf in the execution tree - we don't go upwards on entity types
                    embeddingRootEntityTypes.add(type);
                } else {
                    // for other types, we continue crawl upwards. Make sure we don't process any type twice.
                    if (!otherEmbeddingTypes.has(type)) {
                        otherEmbeddingTypes.add(type);
                        newTypes.add(type);
                    }
                }
            }
        }
        currentTypes = newTypes;
    } while (currentTypes.size);

    return {
        embeddingRootEntityTypes,
        otherEmbeddingTypes
    };
}
