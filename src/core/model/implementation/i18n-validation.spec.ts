import { Source } from 'graphql';
import { describe, expect, it } from 'vitest';
import { applyQuickFix } from '../../../testing/utils/source-validation-utils.js';
import { Project } from '../../project/project.js';
import { ProjectSource } from '../../project/source.js';
import { parseProject } from '../../schema/parsing/parse-project.js';
import { validateParsedProjectSource } from '../../schema/preparation/ast-validator.js';
import { createModel } from '../create-model.js';
import { ValidationContext } from '../validation/validation-context.js';

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

    describe('quick fixes', () => {
        function getMessages(i18n: string) {
            return new Project([
                new ProjectSource('perm.json', permissionProfiles),
                new ProjectSource('graphql.graphql', graphql),
                new ProjectSource('i18n.yaml', i18n),
            ])
                .validate()
                .messages.filter((m) => m.location?.sourceName === 'i18n.yaml');
        }

        function getQuickFixes(i18n: string) {
            return getMessages(i18n).flatMap((m) => m.quickFixes);
        }

        it('offers to remove the localization of a type that does not exist', () => {
            const i18n = `i18n:
  en:
    types:
      Skill:
        label: Skill
        labelPlural: Skills

      Equipment:
        label: Equipment
        labelPlural: Equipment
        fields:
          weight: Weight

      Mission:
        label: Mission
`;
            expect(applyQuickFix(getMessages(i18n), 'Remove localization')).to.equal(`i18n:
  en:
    types:
      Skill:
        label: Skill
        labelPlural: Skills

      Mission:
        label: Mission
`);
            expect(getQuickFixes(i18n).map((q) => q.isPreferred)).to.deep.equal([true]);
        });

        it('offers to remove the localization of a field that does not exist', () => {
            const i18n = `i18n:
  en:
    types:
      Skill:
        label: Skill
        fields:
          name: Name
          level: Level
          description: Description
`;
            expect(applyQuickFix(getMessages(i18n), 'Remove localization')).to.equal(`i18n:
  en:
    types:
      Skill:
        label: Skill
        fields:
          name: Name
          description: Description
`);
        });

        it('offers to remove the localization of an enum value that does not exist', () => {
            const i18n = `i18n:
  en:
    types:
      Importance:
        values:
          LOW: Low
          CRITICAL: Critical
          HIGH: High
`;
            expect(applyQuickFix(getMessages(i18n), 'Remove localization')).to.equal(`i18n:
  en:
    types:
      Importance:
        values:
          LOW: Low
          HIGH: High
`);
        });

        it('removes the parent key when removing its only entry', () => {
            const i18n = `i18n:
  en:
    types:
      Skill:
        label: Skill
        fields:
          level: Level

      Importance:
        label: Importance
`;
            expect(applyQuickFix(getMessages(i18n), 'Remove localization')).to.equal(`i18n:
  en:
    types:
      Skill:
        label: Skill

      Importance:
        label: Importance
`);
        });

        it('offers removal for each language', () => {
            const i18n = `i18n:
  de:
    types:
      Equipment:
        label: Ausrüstung
  en:
    types:
      Equipment:
        label: Equipment
`;
            expect(getQuickFixes(i18n).map((q) => q.description)).to.deep.equal([
                'Remove localization',
                'Remove localization',
            ]);
        });

        it('does not prefer removal if a similar name exists', () => {
            const i18n = `i18n:
  en:
    types:
      Skil:
        label: Skill
      Mision:
        label: Mission
      skill:
        label: Skill
`;
            expect(getQuickFixes(i18n).map((q) => q.isPreferred)).to.deep.equal([
                false,
                false,
                false,
            ]);
        });

        it('does not offer removal in flow style', () => {
            const i18n = `i18n:
  en:
    types: { Equipment: { label: Equipment }, Skill: { label: Skill } }
`;
            expect(getMessages(i18n).map((m) => m.message)).to.deep.equal([
                'There is no type "Equipment" in the model specification. This might be a spelling error.',
            ]);
            expect(getQuickFixes(i18n)).to.deep.equal([]);
        });
    });
});
