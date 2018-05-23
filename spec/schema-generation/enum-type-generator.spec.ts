import { TypeKind } from '../../src/model/config';
import { EnumType } from '../../src/model/implementation';
import { EnumTypeGenerator } from '../../src/schema-generation/enum-type-generator';
import { expect } from 'chai';

describe('EnumTypeGenerator', () => {
    it('generates the enum type', () => {
        const enumType = new EnumType({
            kind: TypeKind.ENUM,
            name: 'Color',
            values: ['RED', 'GREEN', 'BLUE']
        });

        const graphQLType = new EnumTypeGenerator().generate(enumType);
        expect(graphQLType.name).to.equal('Color');
        expect(graphQLType.getValues()).to.have.lengthOf(3);
        expect(graphQLType.getValue('RED')!.name).to.equal('RED');
        expect(graphQLType.getValue('RED')!.value).to.equal('RED');
    });
});
