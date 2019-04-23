import {Field, Model, RootEntityType} from "../../../model/implementation";
import {flatMap} from "../../../utils/utils";
import {getCollectionNameForRootEntity} from "../arango-basics";
import {ViewDescription} from "arangojs/lib/async/database";
import {
    CreateArangoSearchViewMigration,
    DropArangoSearchViewMigration,
    UpdateArangoSearchViewMigration
} from "./migrations";
import {ViewType} from "arangojs/lib/async/view";
import {
    ArangoSearchView,
    ArangoSearchViewProperties,
    ArangoSearchViewPropertiesOptions,
    ArangoSearchViewPropertiesResponse
} from "arangojs/lib/cjs/view";
import {QUICK_SEARCH_GLOBAL_VIEW_NAME} from "../../../schema/constants";
import {FieldConfig, QuickSearchLanguage} from "../../../model/config";
import * as _ from "lodash";

const IDENTITY_ANALYZER = "identity";

export interface ArangoSearchDefinition {
    readonly viewName: string;
    readonly collectionName: string;
    readonly fields: Field[]
}

interface ArangoSearchViewCollectionLink {
    analyzers?: string[];
    fields?: {
        [key: string]: ArangoSearchViewCollectionLink | undefined;
    };
    includeAllFields?: boolean;
    trackListPositions?: boolean;
    storeValues?: "none" | "id";
}

export function getRequiredViewsFromModel(model: Model): ReadonlyArray<ArangoSearchDefinition> {
    return flatMap(model.rootEntityTypes, rootEntity => getViewsForRootEntity(rootEntity));
}

function getViewNameForRootEntity(rootEntity: RootEntityType) {
    return "v_" + getCollectionNameForRootEntity(rootEntity);
}

function getViewsForRootEntity(rootEntity: RootEntityType): ReadonlyArray<ArangoSearchDefinition> {
    if(rootEntity.arangoSearchConfig.isIndexed){
        return [{
            fields: rootEntity.fields.filter(value => value.isQuickSearchIndexed),
            viewName: getViewNameForRootEntity(rootEntity),
            collectionName: getCollectionNameForRootEntity(rootEntity)
        }]
    }else{
        return []
    }
}


export function calculateRequiredArangoSearchViewCreateOperations(views: ArangoSearchView[], definitions: ReadonlyArray<ArangoSearchDefinition>): ReadonlyArray<CreateArangoSearchViewMigration> {
    let viewsToCreate = definitions.filter(value => !views.some(value1 => value1.name === value.viewName));
    // @MSF TODO: include collection size
    return viewsToCreate.map(value => new CreateArangoSearchViewMigration({collectionSize: 0, viewName: value.viewName, properties: getPropertiesFromDefinition(value)}))
}

export function calculateRequiredArangoSearchViewDropOperations(views: ArangoSearchView[], definitions: ReadonlyArray<ArangoSearchDefinition>): ReadonlyArray<DropArangoSearchViewMigration> {
    const viewsToDrop =  views.filter(value => !definitions.some(value1 => value1.viewName === value.name) && value.name != QUICK_SEARCH_GLOBAL_VIEW_NAME)
    return viewsToDrop.map( value => new DropArangoSearchViewMigration({viewName: value.name}))
}


function getAnalyzerFromQuickSearchLanguage(language: QuickSearchLanguage):string {
    // @MSF TODO: fix enum usage
    return "text_" + language.toLowerCase()
}

function getGlobalSearchViewProperties(globalIndexedEntityTypes: RootEntityType[]): ArangoSearchViewPropertiesOptions {
    const properties: ArangoSearchViewPropertiesOptions = {
        links: {},
    }

    const fields = globalIndexedEntityTypes
        .map(value => value.fields
        .filter(value1 => value1.isSearchable))
        .reduce((previousValue, currentValue) => previousValue.concat(currentValue));

    for(const entity of globalIndexedEntityTypes){

        const link: ArangoSearchViewCollectionLink = {
            analyzers: [ IDENTITY_ANALYZER ],
            includeAllFields: false,
            storeValues: "id",
            trackListPositions: false,
            fields: {}
        };

        for(const field of fields){
            if(link.fields![field.name]){
                link.fields![field.name]!.analyzers = [...new Set(link.fields![field.name]!.analyzers!.concat(field.languages.map(getAnalyzerFromQuickSearchLanguage)))]
            }else{
                link.fields![field.name] = {
                    analyzers: field.languages.map(getAnalyzerFromQuickSearchLanguage).concat(["identity"])
                }
            }

        }

        properties.links![getCollectionNameForRootEntity(entity)] = link;
    }

    return properties;
}

function getPropertiesFromDefinition(definition: ArangoSearchDefinition): ArangoSearchViewPropertiesOptions {
    const properties: ArangoSearchViewPropertiesOptions = {
        links: {},
    }

    const link: ArangoSearchViewCollectionLink = {
        analyzers: [ IDENTITY_ANALYZER ],
        includeAllFields: false,
        storeValues: "id",
        trackListPositions: false,
        fields: {}
    };

    for(const field of definition.fields){
        link.fields![field.name] = {
            analyzers: field.languages.map(getAnalyzerFromQuickSearchLanguage).concat(["identity"])
        }
    }

    properties.links![definition.collectionName] = link;

    return properties;
}

function isEqualProperties(defProperties: ArangoSearchViewPropertiesOptions, properties: ArangoSearchViewProperties): boolean {
    if(!_.isEqual(defProperties.links, properties.links)){
        return false
    }
    // @MSF TODO: check other properties
    return true;
}

export async function calculateRequiredArangoSearchViewUpdateOperations(views: ArangoSearchView[], definitions: ReadonlyArray<ArangoSearchDefinition>): Promise<ReadonlyArray<UpdateArangoSearchViewMigration>>{
    const viewsWithPossibleUpdate =  views.filter(value => definitions.some(value1 => value1.viewName === value.name));
    const viewsWithUpdateRequired:[ArangoSearchView, ArangoSearchDefinition, ArangoSearchViewPropertiesOptions][] = [];
    for(let view of viewsWithPossibleUpdate){
        const definiton = definitions.find(value => value.viewName === view.name)!
        const viewProperties = await view.properties();
        let viewFields = viewProperties.links[definiton.collectionName]!.fields!
        const definitionProperties = getPropertiesFromDefinition(definiton);
        if(!isEqualProperties(definitionProperties, viewProperties)){
            viewsWithUpdateRequired.push([view,definiton,definitionProperties])
        }
    }

    // @MSF TODO: include collection size
     return viewsWithUpdateRequired.map(value => new UpdateArangoSearchViewMigration(
         {viewName:value[1].viewName,collectionSize:0,properties: value[2]}))
}



export async function calculateRequiredGlobalViewOperation(entityTypes: ReadonlyArray<RootEntityType>, arangoSearchView: ArangoSearchView):
        Promise<CreateArangoSearchViewMigration | DropArangoSearchViewMigration | UpdateArangoSearchViewMigration | undefined> {
    const globalIndexedEntityTypes = entityTypes.filter(value => value.arangoSearchConfig.isGlobalIndexed);
    const isArangoViewExists = await arangoSearchView.exists();
    if(isArangoViewExists && globalIndexedEntityTypes.length == 0){
        return new DropArangoSearchViewMigration({viewName: QUICK_SEARCH_GLOBAL_VIEW_NAME})
    }
    const definitionProperties: ArangoSearchViewPropertiesOptions = getGlobalSearchViewProperties(globalIndexedEntityTypes);

    if(isArangoViewExists){
        const viewProperties = await arangoSearchView.properties();

        if(isEqualProperties(definitionProperties,viewProperties)){
            return undefined // no migration required
        }else{
            return new UpdateArangoSearchViewMigration({
                properties: definitionProperties,
                viewName: QUICK_SEARCH_GLOBAL_VIEW_NAME,
                collectionSize: 0 // @MSF TODO: include collection size
            })
        }

    }else{
        return new CreateArangoSearchViewMigration({
            properties: definitionProperties,
            viewName: QUICK_SEARCH_GLOBAL_VIEW_NAME,
            collectionSize: 0 // @MSF TODO: include collection size
        })
    }
}