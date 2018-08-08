import { DocumentNode } from 'graphql';
import { ParsedProject, ParsedProjectSourceBaseKind } from '../../src/config/parsed-project';
import { createModel, Model, PermissionProfileConfigMap } from '../../src/model';

export function createSimpleModel(document: DocumentNode): Model {
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
    const parsedProject: ParsedProject = {
        sources: [
            {
                kind: ParsedProjectSourceBaseKind.GRAPHQL,
                namespacePath: [],
                document
            },
            {
                kind: ParsedProjectSourceBaseKind.OBJECT,
                namespacePath: [],
                object: {permissionProfiles},
                pathLocationMap: {}
            }
        ]
    };
    return createModel(parsedProject);
}
