import { expect } from 'chai';
import { Source } from 'graphql';
import { createModel, ValidationContext } from '../../../src/model';
import { Project } from '../../../src/project/project';
import { validateParsedProjectSource } from '../../../src/schema/preparation/ast-validator';
import { parseProject } from '../../../src/schema/schema-builder';

const permissionProfiles = `{
  "permissionProfiles": {
    "default": {
      "permissions": [{
        "access": "readWrite",
        "roles": ["allusers"]
      }]
    }
  }
}`;

const graphql = `
enum Importance {LOW, MEDIUM, HIGH}

"A heroic mission"
type Mission @childEntity {
    date: DateTime
    title: String
    importance: Importance
}

"A special skill of a superhero"
type Skill @valueObject {
    name: String
    description: String
    "A value between 0 and 11"
    strength: Float
    skills: [Skill]
}
`;

const i18n1 = `
i18n:
  en:
    types:
      Skill:
        label: Skill
        labelPlural: Skills
        hint: Something you are good at.
        fields:
          description:
            label: Description
            hint: A more detailed description.
    fields:
      strength:
        label: Strength
        hint: How established something is.`;

describe('I18n validation', () => {
    it('reports no warnings and errors for a valid model', () => {
        const validationContext = new ValidationContext();
        const parsedProject = parseProject(
            new Project([
                new Source(permissionProfiles, 'perm.json'),
                new Source(graphql, 'graphql.graphql'),
                new Source(i18n1, 'i18n.yaml'),
            ]),
            new ValidationContext(),
        );
        const model = createModel(parsedProject);

        model.i18n.validate(validationContext);

        expect(validationContext.asResult().hasMessages()).is.false;
    });

    it('reports double definitions of fields', () => {
        const validationContext = new ValidationContext();
        const parsedProject = parseProject(
            new Project([
                new Source(permissionProfiles, 'perm.json'),
                new Source(graphql, 'graphql.graphql'),
                new Source(i18n1, 'i18n.yaml'),
                new Source(i18n1, 'i18n.yaml'),
            ]),
            new ValidationContext(),
        );
        const model = createModel(parsedProject);

        model.i18n.validate(validationContext);

        expect(validationContext.asResult().hasMessages()).is.true;
        expect(validationContext.asResult().hasErrors()).is.true;
    });

    it('reports wrong usage of fields on non-object-types', () => {
        const wrongBody = `
i18n:
  en:
    types:
      Importance:
        fields:
          LOW: low
        `;

        const validationContext = new ValidationContext();
        const parsedProject = parseProject(
            new Project([
                new Source(permissionProfiles, 'perm.json'),
                new Source(graphql, 'graphql.graphql'),
                new Source(i18n1, 'i18n.yaml'),
                new Source(wrongBody, 'i18n2.yaml'),
            ]),
            new ValidationContext(),
        );
        const model = createModel(parsedProject);

        model.i18n.validate(validationContext);

        expect(validationContext.asResult().hasMessages()).is.true;
        expect(validationContext.asResult().getErrors().length).to.eq(1);
        expect(validationContext.asResult().getErrors()[0].message).to.contain(
            'The type "Importance" is a non-object-type.',
        );
    });

    it('reports wrong usage of values on object-types', () => {
        const wrongBody = `
i18n:
  en:
    types:
      Skill:
        values:
          name: The name of the skill.
        `;

        const validationContext = new ValidationContext();
        const parsedProject = parseProject(
            new Project([
                new Source(permissionProfiles, 'perm.json'),
                new Source(graphql, 'graphql.graphql'),
                new Source(i18n1, 'i18n.yaml'),
                new Source(wrongBody, 'i18n2.yaml'),
            ]),
            new ValidationContext(),
        );
        const model = createModel(parsedProject);

        model.i18n.validate(validationContext);

        expect(validationContext.asResult().hasMessages()).is.true;
        expect(validationContext.asResult().getErrors().length).to.eq(1);
        expect(validationContext.asResult().getErrors()[0].message).to.contain(
            'The type "Skill" is not an enum type. It does not have "values" attribute. Did you mean to use "fields" instead?',
        );
    });

    it('reports translations for non existing fields', () => {
        const wrongBody = `
i18n:
  en:
    types:
      Skill:
        fields:
          foo: Some non-existing field.
        `;

        const validationContext = new ValidationContext();
        const parsedProject = parseProject(
            new Project([
                new Source(permissionProfiles, 'perm.json'),
                new Source(graphql, 'graphql.graphql'),
                new Source(wrongBody, 'i18n2.yaml'),
            ]),
            new ValidationContext(),
        );
        const model = createModel(parsedProject);

        model.i18n.validate(validationContext);

        expect(validationContext.asResult().hasMessages()).is.true;
        expect(validationContext.asResult().hasErrors()).is.false;
        expect(validationContext.asResult().getWarnings().length).to.eq(1);
        expect(validationContext.asResult().getWarnings()[0].message).to.contain(
            'The type "Skill" has no field "foo". This might be a spelling error.',
        );
    });

    it('reports translations for non existing values', () => {
        const wrongBody = `
i18n:
  en:
    types:
      Importance:
        values:
          foo: Some non-existing field.
        `;

        const validationContext = new ValidationContext();
        const parsedProject = parseProject(
            new Project([
                new Source(permissionProfiles, 'perm.json'),
                new Source(graphql, 'graphql.graphql'),
                new Source(wrongBody, 'i18n2.yaml'),
            ]),
            new ValidationContext(),
        );
        const model = createModel(parsedProject);

        model.i18n.validate(validationContext);

        expect(validationContext.asResult().hasMessages()).is.true;
        expect(validationContext.asResult().hasErrors()).is.false;
        expect(validationContext.asResult().getWarnings().length).to.eq(1);
        expect(validationContext.asResult().getWarnings()[0].message).to.contain(
            'The enum type "Importance" has no value "foo". This might be a spelling error.',
        );
    });

    it('reports translations for non existing types as warnings', () => {
        const wrongBody = `
i18n:
  en:
    types:
      Foo:
        label: Test
        `;

        const validationContext = new ValidationContext();
        const parsedProject = parseProject(
            new Project([
                new Source(permissionProfiles, 'perm.json'),
                new Source(graphql, 'graphql.graphql'),
                new Source(wrongBody, 'i18n2.yaml'),
            ]),
            new ValidationContext(),
        );
        const model = createModel(parsedProject);

        model.i18n.validate(validationContext);

        expect(validationContext.asResult().hasMessages()).is.true;
        expect(validationContext.asResult().hasErrors()).is.false;
        expect(validationContext.asResult().getWarnings().length).to.eq(1);
        expect(validationContext.asResult().getWarnings()[0].message).to.contain(
            'There is no type "Foo" in the model specification. This might be a spelling error.',
        );
    });

    it('reports schema-violations of i18n files', () => {
        const wrongBody = `
i18n:
  en:
    typess:
      Skill:
        fields:
          name: The name of the skill.
        `;

        const validationContext = new ValidationContext();
        const parsedProject = parseProject(
            new Project([
                new Source(permissionProfiles, 'perm.json'),
                new Source(graphql, 'graphql.graphql'),
                new Source(i18n1, 'i18n.yaml'),
                new Source(wrongBody, 'i18n2.yaml'),
            ]),
            validationContext,
        );

        parsedProject.sources.forEach((s) =>
            validationContext.addMessage(...validateParsedProjectSource(s).messages),
        );

        expect(validationContext.asResult().hasMessages()).is.true;
        expect(validationContext.asResult().getErrors().length).to.eq(1);
        expect(validationContext.asResult().messages[0].location).to.not.be.undefined;
    });
});
