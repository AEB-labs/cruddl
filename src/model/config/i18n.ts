import { MessageLocation } from '../validation';

export interface LocalizationConfig extends NamespaceLocalizationConfig {
    readonly language: string
}

export interface NamespaceLocalizationConfig {
    readonly namespacePath: ReadonlyArray<string>
    readonly types?: { [name: string]: TypeLocalizationConfig }
    readonly fields?: { [name: string]: LocalizationBaseConfig }
    readonly loc?: MessageLocation;
}

export interface TypeLocalizationConfig {
    readonly singular?: string
    readonly plural?: string
    readonly hint?: string
    readonly loc?: MessageLocation
    readonly fields?: { [name: string]: LocalizationBaseConfig }
    readonly values?: { [name: string]: LocalizationBaseConfig }
}

export interface LocalizationBaseConfig {
    readonly label?: string
    readonly hint?: string
    readonly loc?: MessageLocation
}
