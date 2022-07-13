import { readdir, readFile, stat } from 'fs/promises';
import { resolve } from 'path';
import { flatten } from '../utils/utils';
import { Project, ProjectOptions } from './project';
import { ProjectSource } from './source';

/**
 * Creates a Project by loading source files from a directory
 */
export async function loadProjectFromDir(path: string, options: ProjectOptions = {}): Promise<Project> {
    const sources = await loadSourcesFromDir(path);
    return new Project({
        ...options,
        sources,
    });
}

async function loadSourcesFromDir(dirPath: string, parentSourcePath: string = ''): Promise<ProjectSource[]> {
    const fileNames: string[] = await readdir(dirPath);
    return flatten(await Promise.all(fileNames.map(processFile)));

    async function processFile(fileName: string): Promise<ProjectSource[]> {
        const sourcePath = concatSourcePaths(parentSourcePath, fileName);
        const filePath = resolve(dirPath, fileName);
        const stats = await stat(filePath);
        if (stats.isDirectory()) {
            return await loadSourcesFromDir(filePath, sourcePath);
        }
        const body = await readFile(filePath, 'utf-8');
        return [new ProjectSource(sourcePath, body, filePath)];
    }
}

function concatSourcePaths(path1: string, path2: string) {
    if (!path1) {
        return path2;
    }
    if (!path2) {
        return path1;
    }
    // Always use slashes here because we don't want OS directories but logical source paths
    return `${path1}/${path2}`;
}
