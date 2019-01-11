import { expect } from 'chai';
import { DocumentNode } from 'graphql';
import gql from 'graphql-tag';
import { createModel } from '../../src/model';
import { createSimpleModel } from './model-spec.helper';

describe('createModel', () => {
    it('translates _key: String @key properly', () => {
        const document: DocumentNode = gql`type Test @rootEntity { _key: String @key, test: String }`;
        const model = createSimpleModel(document);
        expect(model.validate().getErrors(), model.validate().toString()).to.deep.equal([]);
        const testType = model.getRootEntityTypeOrThrow('Test');
        expect(testType.fields.filter(f => !f.isSystemField)).to.have.lengthOf(1); // only test should be a non-system field
        expect(testType.getField('_key')).to.be.undefined;
        expect(testType.getKeyFieldOrThrow().name).to.equal('id');
    });

    it('translates id: ID @key properly', () => {
        const document: DocumentNode = gql`type Test @rootEntity { id: ID @key, test: String }`;
        const model = createSimpleModel(document);
        expect(model.validate().getErrors(), model.validate().toString()).to.deep.equal([]);
        const testType = model.getRootEntityTypeOrThrow('Test');
        expect(testType.fields.filter(f => !f.isSystemField)).to.have.lengthOf(1); // only test should be a non-system field
        expect(testType.getField('_key')).to.be.undefined;
        expect(testType.getFieldOrThrow('id').isSystemField).to.be.true;
        expect(testType.getKeyFieldOrThrow().name).to.equal('id');
    });

    it('translates indices declared on root entity', () => {
        const document: DocumentNode = gql`type Test @rootEntity(indices: [
            { id: "a" fields: "test" }
            { id: "b" fields: ["test", "id"], unique: true }
            { id: "c" fields: ["test", "id"], unique: true, sparse: false }
        ]) { test: String }`;
        const model = createSimpleModel(document);
        expect(model.validate().getErrors(), model.validate().toString()).to.deep.equal([]);
        const testType = model.getRootEntityTypeOrThrow('Test');

        const indexA = testType.indices.find(index => index.id === 'a');
        expect(indexA).not.to.be.undefined;
        expect(indexA!.fields.map(f => f.path).join(',')).to.equal('test');
        expect(indexA!.unique).to.equal(false);
        expect(indexA!.sparse).to.equal(false);

        const indexB = testType.indices.find(index => index.id === 'b');
        expect(indexB).not.to.be.undefined;
        expect(indexB!.fields.map(f => f.path).join(',')).to.equal('test,id');
        expect(indexB!.unique).to.equal(true);
        expect(indexB!.sparse).to.equal(true);

        const indexC = testType.indices.find(index => index.id === 'c');
        expect(indexC).not.to.be.undefined;
        expect(indexC!.fields.map(f => f.path).join(',')).to.equal('test,id');
        expect(indexC!.unique).to.equal(true);
        expect(indexC!.sparse).to.equal(false);
    });

    it('translates indices declared on a field', () => {
        const document: DocumentNode = gql`type Test @rootEntity { 
            testA: String @index
            testB: String @unique
            testC: String @unique(sparse: false) 
        }`;
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
});
