import { DocumentNode } from 'graphql';
import {
    ParsedProject,
    ParsedProjectSource,
    ParsedProjectSourceBaseKind,
} from '../../src/config/parsed-project';
import {
    createModel,
    Model,
    NamespaceLocalizationConfig,
    PermissionProfileConfigMap,
} from '../../src/model';

export function createSimpleModel(
    document: DocumentNode,
    i18n?: Record<string, NamespaceLocalizationConfig>,
): Model {
    const permissionProfiles: PermissionProfileConfigMap = {
        default: {
            permissions: [
                {
                    access: 'readWrite',
                    roles: ['*'],
                },
            ],
        },
    };
    const parsedProject: ParsedProject = {
        sources: [
            {
                kind: ParsedProjectSourceBaseKind.GRAPHQL,
                namespacePath: [],
                document,
            },
            {
                kind: ParsedProjectSourceBaseKind.OBJECT,
                namespacePath: [],
                object: { permissionProfiles },
                pathLocationMap: {},
            },
            ...(i18n
                ? [
                      {
                          kind: ParsedProjectSourceBaseKind.OBJECT,
                          namespacePath: [],
                          object: { i18n },
                          pathLocationMap: {},
                      } as ParsedProjectSource,
                  ]
                : []),
        ],
    };
    return createModel(parsedProject);
}
