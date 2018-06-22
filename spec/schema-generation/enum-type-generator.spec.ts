import { expect } from 'chai';
import { EnumType, TypeKind } from '../../src/model';
import { EnumTypeGenerator } from '../../src/schema-generation/enum-type-generator';

describe('EnumTypeGenerator', () => {
    it('generates the enum type', () => {
        const enumType = new EnumType({
            kind: TypeKind.ENUM,
            name: 'Color',
            values: [{value: 'RED'}, {value: 'GREEN'}, {value: 'BLUE'}]
        });

        const graphQLType = new EnumTypeGenerator().generate(enumType);
        expect(graphQLType.name).to.equal('Color');
        expect(graphQLType.getValues()).to.have.lengthOf(3);
        expect(graphQLType.getValue('RED')!.name).to.equal('RED');
        expect(graphQLType.getValue('RED')!.value).to.equal('RED');
    });
});
