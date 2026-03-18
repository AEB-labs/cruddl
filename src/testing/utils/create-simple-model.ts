import type { DocumentNode } from 'graphql';
import type { NamespaceLocalizationConfig } from '../../model/config/i18n.js';
import type { PermissionProfileConfigMap } from '../../model/config/permissions.js';
import { createModel } from '../../model/create-model.js';
import type { Model } from '../../model/implementation/model.js';
import {
    type ParsedProject,
    type ParsedProjectSource,
    ParsedProjectSourceBaseKind,
} from '../../schema/parsing/parsed-project.js';

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
