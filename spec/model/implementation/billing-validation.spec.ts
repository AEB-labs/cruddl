import { expect } from 'chai';
import { Source } from 'graphql';
import { createModel, ValidationContext } from '../../../src/model';
import { Project } from '../../../src/project/project';
import { validateParsedProjectSource } from '../../../src/schema/preparation/ast-validator';
import { parseProject } from '../../../src/schema/schema-builder';

const graphql = `
enum Importance {LOW, MEDIUM, HIGH}

"A heroic mission"
type Mission @RootEntity {
    title: String
    someFloat: Float
}

"A heroic mission"
type Hero @RootEntity {
    name: String @key
}
`;

describe('Billing validation', () => {
    it('accepts valid definition', () => {
        const validDef = {
            billing: {
                billingEntities: [
                    {
                        typeName: 'Mission',
                        keyFieldName: 'title'
                    }
                ]
            }
        };
        const validationContext = new ValidationContext();
        const parsedProject = parseProject(
            new Project([new Source(graphql, 'graphql.graphql'), new Source(JSON.stringify(validDef), 'billing.json')]),
            new ValidationContext()
        );
        const model = createModel(parsedProject);

        model.billingEntityTypes.forEach(value => value.validate(validationContext));

        expect(validationContext.asResult().hasMessages()).is.false;

        const validDef2 = {
            billing: {
                billingEntities: [
                    {
                        typeName: 'Hero'
                    }
                ]
            }
        };
        const validationContext2 = new ValidationContext();
        const parsedProject2 = parseProject(
            new Project([
                new Source(graphql, 'graphql.graphql'),
                new Source(JSON.stringify(validDef2), 'billing.json')
            ]),
            new ValidationContext()
        );
        const model2 = createModel(parsedProject2);

        model2.billingEntityTypes.forEach(value => value.validate(validationContext2));

        expect(validationContext2.asResult().hasMessages()).is.false;
    });
    it('rejects typeNames that do not exist', () => {
        const wrongDef = {
            billing: {
                billingEntities: [
                    {
                        typeName: 'MissionWithTypo',
                        keyFieldName: 'title'
                    }
                ]
            }
        };
        const validationContext = new ValidationContext();
        const parsedProject = parseProject(
            new Project([new Source(graphql, 'graphql.graphql'), new Source(JSON.stringify(wrongDef), 'billing.json')]),
            new ValidationContext()
        );
        const model = createModel(parsedProject);

        model.billingEntityTypes.forEach(value => value.validate(validationContext));

        expect(validationContext.asResult().hasMessages()).is.true;
        expect(validationContext.asResult().hasWarnings()).is.false;
        expect(validationContext.asResult().getErrors().length).to.eq(1);
        expect(validationContext.asResult().getErrors()[0].message).to.contain(
            'No rootEntity with the name "MissionWithTypo" is defined.'
        );
    });

    it('rejects keyFieldNames that do not exist', () => {
        const wrongDef = {
            billing: {
                billingEntities: [
                    {
                        typeName: 'Mission',
                        keyFieldName: 'titleWithTypo'
                    }
                ]
            }
        };
        const validationContext = new ValidationContext();
        const parsedProject = parseProject(
            new Project([new Source(graphql, 'graphql.graphql'), new Source(JSON.stringify(wrongDef), 'billing.json')]),
            new ValidationContext()
        );
        const model = createModel(parsedProject);

        model.billingEntityTypes.forEach(value => value.validate(validationContext));

        expect(validationContext.asResult().hasMessages()).is.true;
        expect(validationContext.asResult().hasWarnings()).is.false;
        expect(validationContext.asResult().getErrors().length).to.eq(1);
        expect(validationContext.asResult().getErrors()[0].message).to.contain(
            'The field "titleWithTypo" is not defined in the type "Mission".'
        );
    });

    it('rejects missing keyField', () => {
        const wrongDef = {
            billing: {
                billingEntities: [
                    {
                        typeName: 'Mission'
                    }
                ]
            }
        };
        const validationContext = new ValidationContext();
        const parsedProject = parseProject(
            new Project([new Source(graphql, 'graphql.graphql'), new Source(JSON.stringify(wrongDef), 'billing.json')]),
            new ValidationContext()
        );
        const model = createModel(parsedProject);

        model.billingEntityTypes.forEach(value => value.validate(validationContext));

        expect(validationContext.asResult().hasMessages()).is.true;
        expect(validationContext.asResult().hasWarnings()).is.false;
        expect(validationContext.asResult().getErrors().length).to.eq(1);
        expect(validationContext.asResult().getErrors()[0].message).to.contain(
            'The type "Mission" does not define a keyField and no "keyFieldName" is defined.'
        );
    });

    it('rejects invalid keyField types', () => {
        const wrongDef = {
            billing: {
                billingEntities: [
                    {
                        typeName: 'Mission',
                        keyFieldName: 'someFloat'
                    }
                ]
            }
        };
        const validationContext = new ValidationContext();
        const parsedProject = parseProject(
            new Project([new Source(graphql, 'graphql.graphql'), new Source(JSON.stringify(wrongDef), 'billing.json')]),
            new ValidationContext()
        );
        const model = createModel(parsedProject);

        model.billingEntityTypes.forEach(value => value.validate(validationContext));

        expect(validationContext.asResult().hasMessages()).is.true;
        expect(validationContext.asResult().hasWarnings()).is.false;
        expect(validationContext.asResult().getErrors().length).to.eq(1);
        expect(validationContext.asResult().getErrors()[0].message).to.contain(
            'The field "someFloat" in the type "Mission" is not a "String", "Int", or "ID".'
        );
    });

    it('rejects duplicate type', () => {
        const wrongDef = {
            billing: {
                billingEntities: [
                    {
                        typeName: 'Mission',
                        keyFieldName: 'title'
                    },
                    {
                        typeName: 'Mission',
                        keyFieldName: 'title'
                    }
                ]
            }
        };
        const validationContext = new ValidationContext();
        const parsedProject = parseProject(
            new Project([new Source(graphql, 'graphql.graphql'), new Source(JSON.stringify(wrongDef), 'billing.json')]),
            new ValidationContext()
        );
        const model = createModel(parsedProject);

        model.billingEntityTypes.forEach(value => value.validate(validationContext));

        expect(validationContext.asResult().hasMessages()).is.true;
        expect(validationContext.asResult().hasWarnings()).is.false;
        expect(validationContext.asResult().getErrors().length).to.eq(2);
        expect(validationContext.asResult().getErrors()[0].message).to.contain(
            'There are multiple billing configurations for the type "Mission".'
        );
        expect(validationContext.asResult().getErrors()[1].message).to.contain(
            'There are multiple billing configurations for the type "Mission".'
        );
    });
});
