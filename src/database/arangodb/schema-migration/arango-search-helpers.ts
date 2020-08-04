import { Database } from 'arangojs';
import { ArangoSearchView, ArangoSearchViewPropertiesOptions } from 'arangojs/lib/cjs/view';
import * as _ from 'lodash';
import { FlexSearchLanguage } from '../../../model/config';
import { Field, Model, RootEntityType } from '../../../model/implementation';
import { getCollectionNameForRootEntity } from '../arango-basics';
import {
    CreateArangoSearchViewMigration,
    DropArangoSearchViewMigration,
    RecreateArangoSearchViewMigration,
    SchemaMigration,
    UpdateArangoSearchViewMigration
} from './migrations';

export const IDENTITY_ANALYZER = 'identity';
export const FLEX_SEARCH_VIEW_PREFIX = 'flex_view_';

export interface FlexSearchPrimarySortConfig {
    readonly field: string;
    readonly asc: boolean;
}

export interface ArangoSearchDefinition {
    readonly viewName: string;
    readonly collectionName: string;
    readonly fields: ReadonlyArray<Field>;
    readonly primarySort: ReadonlyArray<FlexSearchPrimarySortConfig>;
}

interface ArangoSearchViewCollectionLink {
    analyzers?: string[];
    fields?: {
        [key: string]: ArangoSearchViewCollectionLink | undefined;
    };
    includeAllFields?: boolean;
    trackListPositions?: boolean;
    storeValues?: 'none' | 'id';
}

export interface ArangoSearchConfiguration {
    readonly recursionDepth?: number;
    readonly commitIntervalMsec?: number;
    readonly skipVersionCheckForArangoSearchMigrations?: boolean;
}

export interface ArangoSearchViewProperties {
    cleanupIntervalStep: number;
    consolidationIntervalMsec: number;
    writebufferIdle: number;
    writebufferActive: number;
    writebufferSizeMax: number;
    consolidationPolicy: {
        type: 'bytes_accum' | 'tier';
        threshold?: number;
        segments_min?: number;
        segments_max?: number;
        segments_bytes_max?: number;
        segments_bytes_floor?: number;
        lookahead?: number;
    };
    links: {
        [key: string]: ArangoSearchViewCollectionLink | undefined;
    };
    primarySort?: FlexSearchPrimarySortConfig[];
    commitIntervalMsec?: number;
}

export function getRequiredViewsFromModel(model: Model): ReadonlyArray<ArangoSearchDefinition> {
    return model.rootEntityTypes
        .filter(value => value.isFlexSearchIndexed)
        .map(rootEntity => getViewForRootEntity(rootEntity));
}

export function getFlexSearchViewNameForRootEntity(rootEntity: RootEntityType) {
    return FLEX_SEARCH_VIEW_PREFIX + getCollectionNameForRootEntity(rootEntity);
}

function getViewForRootEntity(rootEntity: RootEntityType): ArangoSearchDefinition {
    return {
        fields: rootEntity.fields.filter(value => value.isFlexSearchIndexed || value.isFlexSearchFulltextIndexed),
        viewName: getFlexSearchViewNameForRootEntity(rootEntity),
        collectionName: getCollectionNameForRootEntity(rootEntity),
        primarySort: rootEntity.flexSearchPrimarySort
    };
}

export async function calculateRequiredArangoSearchViewCreateOperations(
    existingViews: ArangoSearchView[],
    requiredViews: ReadonlyArray<ArangoSearchDefinition>,
    db: Database,
    configuration?: ArangoSearchConfiguration
): Promise<ReadonlyArray<SchemaMigration>> {
    let viewsToCreate = requiredViews.filter(value => !existingViews.some(value1 => value1.name === value.viewName));

    async function mapToMigration(value: ArangoSearchDefinition): Promise<CreateArangoSearchViewMigration> {
        const colExists = await db.collection(value.collectionName).exists();
        const count: number = colExists ? (await db.collection(value.collectionName).count()).count : 0;
        return new CreateArangoSearchViewMigration({
            collectionSize: count,
            collectionName: value.collectionName,
            viewName: value.viewName,
            properties: getPropertiesFromDefinition(value, configuration)
        });
    }

    return await Promise.all(viewsToCreate.map(mapToMigration));
}

export function calculateRequiredArangoSearchViewDropOperations(
    views: ArangoSearchView[],
    definitions: ReadonlyArray<ArangoSearchDefinition>
): ReadonlyArray<SchemaMigration> {
    const viewsToDrop = views.filter(
        value =>
            !definitions.some(value1 => value1.viewName === value.name) &&
            value.name.startsWith(FLEX_SEARCH_VIEW_PREFIX)
    );
    return viewsToDrop.map(value => new DropArangoSearchViewMigration({ viewName: value.name }));
}

export function getAnalyzerFromFlexSearchLanguage(flexSearchLanguage?: FlexSearchLanguage): string {
    return flexSearchLanguage ? 'text_' + flexSearchLanguage.toLowerCase() : 'identity';
}

function getPropertiesFromDefinition(
    definition: ArangoSearchDefinition,
    configuration?: ArangoSearchConfiguration
): ArangoSearchViewPropertiesOptions {
    const recursionDepth = configuration && configuration.recursionDepth ? configuration.recursionDepth : 1;
    const properties: ArangoSearchViewPropertiesOptions = {
        links: {},
        commitIntervalMsec: configuration && configuration.commitIntervalMsec ? configuration.commitIntervalMsec : 1000,
        primarySort: definition && definition.primarySort ? definition.primarySort.slice() : []
    };

    const link: ArangoSearchViewCollectionLink = {
        analyzers: [IDENTITY_ANALYZER],
        includeAllFields: false,
        storeValues: 'id',
        trackListPositions: false,
        fields: {}
    };

    function fieldDefinitionFor(
        field: Field,
        recursionDepth: number,
        path: ReadonlyArray<Field> = []
    ): ArangoSearchViewCollectionLink {
        if (field.type.isObjectType) {
            const fields: { [key: string]: ArangoSearchViewCollectionLink | undefined } = {};
            field.type.fields
                .filter(
                    field =>
                        (field.isFlexSearchIndexed || field.isFlexSearchFulltextIndexed) &&
                        !path.some(
                            value => value.name === field.name && field.declaringType.name === value.declaringType.name
                        )
                )
                .forEach(value => (fields[value.name] = fieldDefinitionFor(value, recursionDepth, path.concat(field))));
            return {
                fields
            };
        } else {
            const analyzers: string[] = [];
            if (field.isFlexSearchFulltextIndexed && field.flexSearchLanguage) {
                analyzers.push(getAnalyzerFromFlexSearchLanguage(field.flexSearchLanguage));
            }
            if (field.isFlexSearchIndexed) {
                analyzers.push(IDENTITY_ANALYZER);
            }
            if (_.isEqual(analyzers, [IDENTITY_ANALYZER])) {
                return {};
            } else {
                return {
                    analyzers
                };
            }
        }
    }

    for (const field of definition.fields) {
        link.fields![field.name] = fieldDefinitionFor(field, recursionDepth);
    }

    properties.links![definition.collectionName] = link;

    return properties;
}

function isEqualProperties(
    definitionProperties: ArangoSearchViewPropertiesOptions,
    viewProperties: ArangoSearchViewProperties
): boolean {
    return (
        _.isEqual(definitionProperties.links, viewProperties.links) &&
        _.isEqual(definitionProperties.primarySort, viewProperties.primarySort) &&
        _.isEqual(definitionProperties.commitIntervalMsec, viewProperties.commitIntervalMsec)
    );
}

function isRecreateRequired(
    definitionProperties: ArangoSearchViewPropertiesOptions,
    viewProperties: ArangoSearchViewProperties
): boolean {
    return !_.isEqual(definitionProperties.primarySort, viewProperties.primarySort);
}

export async function calculateRequiredArangoSearchViewUpdateOperations(
    views: ArangoSearchView[],
    definitions: ReadonlyArray<ArangoSearchDefinition>,
    db: Database,
    configuration?: ArangoSearchConfiguration
): Promise<ReadonlyArray<SchemaMigration>> {
    const viewsWithUpdateRequired: (UpdateArangoSearchViewMigration | RecreateArangoSearchViewMigration)[] = [];
    for (const view of views) {
        const definition = definitions.find(value => value.viewName === view.name);
        if (!definition) {
            continue;
        }
        const viewProperties = await view.properties();

        const definitionProperties = getPropertiesFromDefinition(definition, configuration);
        if (!isEqualProperties(definitionProperties, viewProperties)) {
            const colExists = await db.collection(definition.collectionName).exists();
            const count: number = colExists ? (await db.collection(definition.collectionName).count()).count : 0;
            if (isRecreateRequired(definitionProperties, viewProperties)) {
                viewsWithUpdateRequired.push(
                    new RecreateArangoSearchViewMigration({
                        viewName: definition.viewName,
                        collectionName: definition.collectionName,
                        collectionSize: count,
                        properties: definitionProperties
                    })
                );
            } else {
                viewsWithUpdateRequired.push(
                    new UpdateArangoSearchViewMigration({
                        viewName: definition.viewName,
                        collectionName: definition.collectionName,
                        collectionSize: count,
                        properties: definitionProperties
                    })
                );
            }
        }
    }

    return viewsWithUpdateRequired;
}
