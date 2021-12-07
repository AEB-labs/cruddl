import { expect } from 'chai';
import { DocumentNode } from 'graphql';
import gql from 'graphql-tag';
import { createModel } from '../../src/model';
import { createSimpleModel } from './model-spec.helper';

describe('createModel', () => {
    it('translates _key: String @key properly', () => {
        const document: DocumentNode = gql`
            type Test @rootEntity {
                _key: String @key
                test: String
            }
        `;
        const model = createSimpleModel(document);
        expect(model.validate().getErrors(), model.validate().toString()).to.deep.equal([]);
        const testType = model.getRootEntityTypeOrThrow('Test');
        expect(testType.fields.filter(f => !f.isSystemField)).to.have.lengthOf(1); // only test should be a non-system field
        expect(testType.getField('_key')).to.be.undefined;
        expect(testType.getKeyFieldOrThrow().name).to.equal('id');
    });

    it('translates id: ID @key properly', () => {
        const document: DocumentNode = gql`
            type Test @rootEntity {
                id: ID @key
                test: String
            }
        `;
        const model = createSimpleModel(document);
        expect(model.validate().getErrors(), model.validate().toString()).to.deep.equal([]);
        const testType = model.getRootEntityTypeOrThrow('Test');
        expect(testType.fields.filter(f => !f.isSystemField)).to.have.lengthOf(1); // only test should be a non-system field
        expect(testType.getField('_key')).to.be.undefined;
        expect(testType.getFieldOrThrow('id').isSystemField).to.be.true;
        expect(testType.getKeyFieldOrThrow().name).to.equal('id');
    });

    it('translates indices declared on root entity', () => {
        const document: DocumentNode = gql`
            type Test
                @rootEntity(
                    indices: [
                        { fields: "test" }
                        { fields: ["test", "id"], unique: true }
                        { fields: ["test", "id"], unique: true, sparse: false }
                    ]
                ) {
                test: String
            }
        `;
        const model = createSimpleModel(document);
        expect(model.validate().getErrors(), model.validate().toString()).to.deep.equal([]);
        const testType = model.getRootEntityTypeOrThrow('Test');

        const indexA = testType.indices[0];
        expect(indexA).not.to.be.undefined;
        expect(indexA!.fields.map(f => f.path).join(',')).to.equal('test');
        expect(indexA!.unique).to.equal(false);
        expect(indexA!.sparse).to.equal(false);

        const indexB = testType.indices[1];
        expect(indexB).not.to.be.undefined;
        expect(indexB!.fields.map(f => f.path).join(',')).to.equal('test,id');
        expect(indexB!.unique).to.equal(true);
        expect(indexB!.sparse).to.equal(true);

        const indexC = testType.indices[2];
        expect(indexC).not.to.be.undefined;
        expect(indexC!.fields.map(f => f.path).join(',')).to.equal('test,id');
        expect(indexC!.unique).to.equal(true);
        expect(indexC!.sparse).to.equal(false);
    });

    it('translates indices declared on a field', () => {
        const document: DocumentNode = gql`
            type Test @rootEntity {
                testA: String @index
                testB: String @unique
                testC: String @unique(sparse: false)
            }
        `;
        const model = createSimpleModel(document);
        expect(model.validate().getErrors(), model.validate().toString()).to.deep.equal([]);
        const testType = model.getRootEntityTypeOrThrow('Test');

        const indexA = testType.indices.find(index => index.fields.map(f => f.dotSeparatedPath).join(',') === 'testA');
        expect(indexA).not.to.be.undefined;
        expect(indexA!.unique).to.equal(false);
        expect(indexA!.sparse).to.equal(false);

        const indexB = testType.indices.find(index => index.fields.map(f => f.dotSeparatedPath).join(',') === 'testB');
        expect(indexB).not.to.be.undefined;
        expect(indexB!.unique).to.equal(true);
        expect(indexB!.sparse).to.equal(true);

        const indexC = testType.indices.find(index => index.fields.map(f => f.dotSeparatedPath).join(',') === 'testC');
        expect(indexC).not.to.be.undefined;
        expect(indexC!.unique).to.equal(true);
        expect(indexC!.sparse).to.equal(false);
    });

    // We don't disallow combining @index and @unique because it can be useful when you want a sparse unique constraint,
    // but still be able to filter for null values.
    it('supports both @index and @unique on a single field', () => {
        const document: DocumentNode = gql`
            type Test @rootEntity {
                test: String @index @unique
            }
        `;

        const model = createSimpleModel(document);
        expect(model.validate().getErrors(), model.validate().toString()).to.deep.equal([]);
        const testType = model.getRootEntityTypeOrThrow('Test');

        const indices = testType.indices.filter(i => i.fields.length === 1 && i.fields[0].dotSeparatedPath === 'test');
        expect(indices.length).to.equal(2);
        const [indexA, indexB] = indices;

        expect(indexA).not.to.be.undefined;
        expect(indexA!.unique).to.equal(false);
        expect(indexA!.sparse).to.equal(false);
        expect(indexB).not.to.be.undefined;
        expect(indexB!.unique).to.equal(true);
        expect(indexB!.sparse).to.equal(true);
    });

    it('respects @businessObject directive', () => {
        const document: DocumentNode = gql`
            type Test @rootEntity @businessObject {
                key: String
            }

            type Test2 @rootEntity {
                key: String
            }
        `;

        const model = createSimpleModel(document);
        expect(model.validate().getErrors(), model.validate().toString()).to.deep.equal([]);

        const type = model.getRootEntityTypeOrThrow('Test');
        expect(type.isBusinessObject).to.be.true;

        const type2 = model.getRootEntityTypeOrThrow('Test2');
        expect(type2.isBusinessObject).to.be.false;
    });
});
