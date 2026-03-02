import { describe, expect, it } from 'vitest';
import { EnumType, Model, TypeKind } from '../../src/model/index.js';
import { EnumTypeGenerator } from '../../src/schema-generation/enum-type-generator.js';

describe('EnumTypeGenerator', () => {
    const model = new Model({ types: [] });

    it('generates the enum type', () => {
        const enumType = new EnumType(
            {
                kind: TypeKind.ENUM,
                name: 'Color',
                values: [{ value: 'RED' }, { value: 'GREEN' }, { value: 'BLUE' }],
            },
            model,
        );

        const graphQLType = new EnumTypeGenerator().generate(enumType);
        expect(graphQLType.name).to.equal('Color');
        expect(graphQLType.getValues()).to.have.lengthOf(3);
        expect(graphQLType.getValue('RED')!.name).to.equal('RED');
        expect(graphQLType.getValue('RED')!.value).to.equal('RED');
    });
});
