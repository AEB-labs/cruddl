import { expect } from 'chai';
import { DocumentNode } from 'graphql';
import gql from 'graphql-tag';
import { ParsedProject, ParsedProjectSource, ParsedProjectSourceBaseKind } from '../../src/config/parsed-project';
import { createModel, PermissionProfileConfigMap } from '../../src/model';

describe('createModel', () => {
    const permissionProfiles: PermissionProfileConfigMap = {
        'default': {
            permissions: [
                {
                    access: 'readWrite',
                    roles: ['*']
                }
            ]
        }
    };

    it('translates _key: String @key properly', () => {
        const document: DocumentNode = gql`type Test @rootEntity { _key: String @key, test: String }`;
        const model = createModel(createSimpleParsedProject(document));
        expect(model.validate().getErrors(), model.validate().toString()).to.deep.equal([]);
        const testType = model.getRootEntityTypeOrThrow('Test');
        expect(testType.fields.filter(f => !f.isSystemField)).to.have.lengthOf(1); // only test should be a non-system field
        expect(testType.getField('_key')).to.be.undefined;
        expect(testType.getKeyFieldOrThrow().name).to.equal('id');
    });

    it('translates id: ID @key properly', () => {
        const document: DocumentNode = gql`type Test @rootEntity { id: ID @key, test: String }`;
        const model = createModel(createSimpleParsedProject(document));
        expect(model.validate().getErrors(), model.validate().toString()).to.deep.equal([]);
        const testType = model.getRootEntityTypeOrThrow('Test');
        expect(testType.fields.filter(f => !f.isSystemField)).to.have.lengthOf(1); // only test should be a non-system field
        expect(testType.getField('_key')).to.be.undefined;
        expect(testType.getFieldOrThrow('id').isSystemField).to.be.true;
        expect(testType.getKeyFieldOrThrow().name).to.equal('id');
    });
});


function createSimpleParsedProject(document: DocumentNode): ParsedProject {
    const permissionProfiles: PermissionProfileConfigMap = {
        'default': {
            permissions: [
                {
                    access: 'readWrite',
                    roles: ['*']
                }
            ]
        }
    };
    return {
        sources: [
            {
                kind: ParsedProjectSourceBaseKind.GRAPHQL,
                namespacePath: [],
                document
            },
            {
                kind: ParsedProjectSourceBaseKind.OBJECT,
                namespacePath: [],
                object: { permissionProfiles },
                pathLocationMap: {}
            }
        ]
    }
}