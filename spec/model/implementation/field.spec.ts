import { ValidationContext } from '../../../src/model/implementation/validation';
import { Field, Model, RootEntityType, TypeKind } from '../../../src/model';
import { expect } from 'chai';

describe('Field', () => {
    const model = new Model({
        types: [{
            name: 'Address',
            kind: TypeKind.VALUE_OBJECT,
            fields: [{
                name: 'name',
                typeName: 'String'
            }]
        }, {
            name: 'Country',
            kind: TypeKind.ROOT_ENTITY,
            fields: [{
                name: 'isoCode',
                typeName: 'String'
            }]
        }]
    });

    const deliveryType = new RootEntityType({
        name: 'Delivery',
        kind: TypeKind.ROOT_ENTITY,
        fields: []
    }, model);

    describe('type', () => {
        it('resolves user-defined types', () => {
            const field = new Field({
                name: 'address',
                typeName: 'Address'
            }, deliveryType, model);
            expect(field.type).to.equal(model.getType('Address'));
            expect(field.hasValidType).to.be.true;
        });

        it('falls back to pseudo type if typeName is not found', () => {
            // this is important so that the model does not break if it is invalid
            const field = new Field({
                name: 'deliveryNumber',
                typeName: 'Undefined'
            }, deliveryType, model);
            expect(field.type).not.to.be.undefined;
            expect(field.type.name).to.equal('Undefined');
            expect(field.hasValidType).to.be.false;
        });
    });

    describe('validate', () => {
        it('accepts built-in type', () => {
            const field = new Field({
                name: 'deliveryNumber',
                typeName: 'String'
            }, deliveryType, model);

            const context = new ValidationContext();
            field.validate(context);

            expect(context.asResult().hasErrors()).to.be.false;
        });

        it('accepts user-defined types', () => {
            const field = new Field({
                name: 'address',
                typeName: 'Address'
            }, deliveryType, model);

            const context = new ValidationContext();
            field.validate(context);

            expect(context.asResult().hasErrors()).to.be.false;
        });

        it('reports undefined type', () => {
            const field = new Field({
                name: 'deliveryNumber',
                typeName: 'UndefinedType'
            }, deliveryType, model);

            const context = new ValidationContext();
            field.validate(context);

            expect(context.asResult().hasErrors()).to.be.true;
            expect(context.validationMessages.length).to.equal(1);
            expect(context.validationMessages[0].message).to.include(`UndefinedType`);
        });

        it('rejects fields with root entity type without @relation or @reference', () => {
            const field = new Field({
                name: 'country',
                typeName: 'Country'
            }, deliveryType, model);

            const context = new ValidationContext();
            field.validate(context);

            expect(context.asResult().hasErrors()).to.be.true;
            expect(context.validationMessages.length).to.equal(1);
            expect(context.validationMessages[0].message).to.include(`root entity`);
        });
    });
});
