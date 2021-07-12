import { expect } from 'chai';
import gql from 'graphql-tag';
import { getRequiredViewsFromModel } from '../../../../src/database/arangodb/schema-migration/arango-search-helpers';
import { createSimpleModel } from '../../../model/model-spec.helper';

describe('arango-search-helper', () => {
    describe('getRequiredViewsFromModel', () => {
        it('creates simple view definition', () => {
            const model = createSimpleModel(gql`
                type Delivery
                    @rootEntity(flexSearch: true, flexSearchOrder: [{ field: "deliveryNumber", direction: DESC }]) {
                    deliveryNumber: String @flexSearch
                }
            `);

            const views = getRequiredViewsFromModel(model);
            expect(views).to.have.lengthOf(1);
            const view = views[0];
            expect(view.primarySort).to.deep.equal([
                { field: 'deliveryNumber', asc: false },
                { field: '_key', asc: true }
            ]);
        });

        it('uses _key instead of id in primary sort', () => {
            const model = createSimpleModel(gql`
                type Delivery
                    @rootEntity(
                        flexSearch: true
                        flexSearchOrder: [{ field: "id", direction: DESC }, { field: "deliveryNumber", direction: ASC }]
                    ) {
                    deliveryNumber: String @flexSearch
                }
            `);

            const views = getRequiredViewsFromModel(model);
            expect(views).to.have.lengthOf(1);
            const view = views[0];
            expect(view.primarySort).to.deep.equal([
                { field: '_key', asc: false },
                { field: 'deliveryNumber', asc: true }
            ]);
        });

        it('leaves id fields in value objects in primary sort alone', () => {
            const model = createSimpleModel(gql`
                type Delivery @rootEntity(flexSearch: true, flexSearchOrder: [{ field: "value.id", direction: DESC }]) {
                    deliveryNumber: String @flexSearch
                    value: Value
                }

                type Value @valueObject {
                    id: String
                }
            `);

            const views = getRequiredViewsFromModel(model);
            expect(views).to.have.lengthOf(1);
            const view = views[0];
            expect(view.primarySort).to.deep.equal([
                { field: 'value.id', asc: false },
                { field: '_key', asc: true }
            ]);
        });
    });
});
