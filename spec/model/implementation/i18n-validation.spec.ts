import { expect } from "chai";
import {  Source } from 'graphql';
import { createModel, ValidationContext } from '../../../src/model';
import { Project } from '../../../src/project/project';
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
"A heroic mission"
type Mission @childEntity {
    date: DateTime
    title: String
}

"A special skill of a superhero"
type Skill @valueObject {
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
        singular: Skill
        plural: Skills
        hint: Something you are good at.
        fields:
          description:
            label: Description
            hint: A more detailed description.
          age: age
    fields:
      strength:
        label: Strength
        hint: How established something is.`;

describe('I18n validation', () => {
    it('reports no warnings and errors for a valid model', () => {
        const validationContext = new ValidationContext();
        const parsedProject = parseProject(new Project([new Source(permissionProfiles, 'perm.json'), new Source(graphql, 'graphql.graphql'), new Source(i18n1, 'i18n.yaml')]), new ValidationContext());
        const model = createModel(parsedProject);

        model.i18n.validate(validationContext);

        expect(validationContext.asResult().hasMessages()).is.false;
    });

    it('reports double definitions of fields', () => {
        const validationContext = new ValidationContext();
        const parsedProject = parseProject(new Project([new Source(permissionProfiles, 'perm.json'), new Source(graphql, 'graphql.graphql'), new Source(i18n1, 'i18n.yaml'), new Source(i18n1, 'i18n.yaml')]), new ValidationContext());
        const model = createModel(parsedProject);

        model.i18n.validate(validationContext);

        expect(validationContext.asResult().hasMessages()).is.true;
    });
});
