import { Database } from 'arangojs';
import {
    ArangoSearchView,
    ArangoSearchViewLink,
    ArangoSearchViewProperties,
    ArangoSearchViewPropertiesOptions
} from 'arangojs/view';
import * as _ from 'lodash';
import { Field, Model, RootEntityType } from '../../../model';
import { IDENTITY_ANALYZER, NORM_CI_ANALYZER } from '../../../model/implementation/flex-search';
import { OrderDirection } from '../../../model/implementation/order';
import { ID_FIELD } from '../../../schema/constants';
import { GraphQLI18nString } from '../../../schema/scalars/string-map';
import { getCollectionNameForRootEntity } from '../arango-basics';
import {
    CreateArangoSearchViewMigration,
    DropArangoSearchViewMigration,
    RecreateArangoSearchViewMigration,
    SchemaMigration,
    UpdateArangoSearchViewMigration
} from './migrations';

export const FLEX_SEARCH_VIEW_PREFIX = 'flex_view_';

export interface FlexSearchPrimarySortConfig {
    readonly field: string;
    readonly asc: boolean;
}

export interface ArangoSearchDefinition {
    readonly rootEntityType: RootEntityType;
    readonly viewName: string;
    readonly collectionName: string;
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
    readonly consolidationIntervalMsec?: number;
}

export function getRequiredViewsFromModel(model: Model): ReadonlyArray<ArangoSearchDefinition> {
    return model.rootEntityTypes
        .filter(value => value.isFlexSearchIndexed)
        .map(rootEntity => getViewForRootEntity(rootEntity));
}

export function getFlexSearchViewNameForRootEntity(rootEntity: RootEntityType) {
    return FLEX_SEARCH_VIEW_PREFIX + getCollectionNameForRootEntity(rootEntity);
}

function getViewForRootEntity(rootEntityType: RootEntityType): ArangoSearchDefinition {
    return {
        rootEntityType,
        viewName: getFlexSearchViewNameForRootEntity(rootEntityType),
        collectionName: getCollectionNameForRootEntity(rootEntityType),
        primarySort: rootEntityType.flexSearchPrimarySort.map(clause => ({
            field: clause.field.path === ID_FIELD ? '_key' : clause.field.path,
            asc: clause.direction === OrderDirection.ASCENDING
        }))
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

function getPropertiesFromDefinition(
    definition: ArangoSearchDefinition,
    configuration?: ArangoSearchConfiguration
): ArangoSearchViewPropertiesOptions {
    const recursionDepth = configuration && configuration.recursionDepth ? configuration.recursionDepth : 1;
    return {
        links: {
            [definition.collectionName]: {
                analyzers: [IDENTITY_ANALYZER],
                includeAllFields: false,
                storeValues: 'id',
                trackListPositions: false,
                fields: fieldDefinitionsFor(definition.rootEntityType.fields),

                // missing in types, see https://github.com/arangodb/arangojs/issues/759
                // if this is not set, creating the view would acquire an exclusive lock on the collections
                inBackground: true
            } as ArangoSearchViewLink
        },
        commitIntervalMsec: configuration?.commitIntervalMsec ? configuration.commitIntervalMsec : 1000,
        consolidationIntervalMsec: configuration?.consolidationIntervalMsec
            ? configuration.consolidationIntervalMsec
            : 1000,
        primarySort: definition?.primarySort ? definition.primarySort.slice() : []
    };

    function fieldDefinitionsFor(
        fields: ReadonlyArray<Field>,
        path: ReadonlyArray<Field> = []
    ): { [key: string]: ArangoSearchViewCollectionLink | undefined } {
        const fieldDefinitions: { [key: string]: ArangoSearchViewCollectionLink | undefined } = {};
        const fieldsToIndex = fields.filter(
            field =>
                (field.isFlexSearchIndexed || field.isFlexSearchFulltextIndexed) &&
                path.filter(f => f === field).length < recursionDepth
        );
        for (const field of fieldsToIndex) {
            let arangoFieldName;
            if (field.declaringType.isRootEntityType && field.isSystemField && field.name === ID_FIELD) {
                arangoFieldName = '_key';
            } else {
                arangoFieldName = field.name;
            }
            fieldDefinitions[arangoFieldName] = fieldDefinitionFor(field, [...path, field]);
        }
        return fieldDefinitions;
    }

    function fieldDefinitionFor(field: Field, path: ReadonlyArray<Field> = []): ArangoSearchViewCollectionLink {
        if (field.type.isObjectType) {
            return {
                fields: fieldDefinitionsFor(field.type.fields, path)
            };
        }

        const analyzers = new Set<string>();
        if (field.isFlexSearchFulltextIndexed && field.flexSearchLanguage) {
            analyzers.add(field.getFlexSearchFulltextAnalyzerOrThrow());
        }
        if (field.isFlexSearchIndexed && field.isFlexSearchIndexCaseSensitive) {
            analyzers.add(IDENTITY_ANALYZER);
        }
        if (field.isFlexSearchIndexed && !field.isFlexSearchIndexCaseSensitive) {
            analyzers.add(NORM_CI_ANALYZER);
        }

        const link: ArangoSearchViewCollectionLink = {};
        // only set this property if it's not the default (["identity"])
        if (analyzers.size !== 1 || !analyzers.has(IDENTITY_ANALYZER)) {
            link.analyzers = Array.from(analyzers);
        }

        if (field.type.isScalarType && field.type.name === GraphQLI18nString.name) {
            // an I18nString is an object with language->valueInLanguage mappings
            // we simply analyze all fields (i.e. all languages). They will inherit the analyzers of the main link.
            link.includeAllFields = true;
        }

        return link;
    }
}

export function isEqualProperties(
    definitionProperties: ArangoSearchViewPropertiesOptions,
    viewProperties: ArangoSearchViewProperties
): boolean {
    return (
        _.isEqual(definitionProperties.links, viewProperties.links) &&
        _.isEqual(definitionProperties.primarySort, viewProperties.primarySort) &&
        _.isEqual(
            definitionProperties.commitIntervalMsec,
            (viewProperties as any).commitIntervalMsec /* somehow missing in types */
        )
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
