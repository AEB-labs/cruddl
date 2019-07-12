import { QuickSearchLanguage } from '../../model/config';
import { ArangoDBAdapter } from './arangodb-adapter';

export class ArangoSearchTokenizer {
    constructor(readonly adapter: ArangoDBAdapter) {

    }

    private cachedTokenizations: [string, QuickSearchLanguage, ReadonlyArray<string>][] = [];

    addTokenToCache(expression: string, quickSearchLanguage: QuickSearchLanguage, tokens: ReadonlyArray<string>) {
        if (!this.getTokenFromCache(expression, quickSearchLanguage)) {
            this.cachedTokenizations.push([expression, quickSearchLanguage, tokens]);
        }
    }

    getTokenFromCache(expression: string, quickSearchLanguage: QuickSearchLanguage): undefined | ReadonlyArray<string> {
        const tokens = this.cachedTokenizations.find(value => value[0] === expression && value[1] === quickSearchLanguage);
        return tokens ? tokens[2] : undefined;
    }

    clearCache() {
        this.cachedTokenizations = [];
    }
}