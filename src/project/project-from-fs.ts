import { Project, ProjectOptions } from './project';
import { ProjectSource } from './source';
import * as fs from 'fs';
import * as path from 'path';
import { PathLike, Stats } from 'fs';
import * as util from 'util';
import { flatten } from '../utils/utils';

const readdir = util.promisify<PathLike, string[]>(fs.readdir);
const stat = util.promisify<PathLike, Stats>(fs.stat);
const readFile = util.promisify<PathLike, string, string>(fs.readFile);

/**
 * Creates a Project by loading source files from a directory
 */
export async function loadProjectFromDir(path: string, options: ProjectOptions = {}): Promise<Project> {
    const sources = await loadSourcesFromDir(path);
    return new Project({
        ...options,
        sources
    });
}

async function loadSourcesFromDir(dirPath: string, relativePath: string = ''): Promise<ProjectSource[]> {
    const fileNames: string[] = await readdir(dirPath);
    return flatten(await Promise.all(fileNames.map(processFile)));

    async function processFile(fileName: string): Promise<ProjectSource[]> {
        const relativeFilePath = path.resolve(relativePath, fileName);
        const filePath = path.resolve(dirPath, fileName);
        const stats = await stat(filePath);
        if (stats.isDirectory()) {
            return await loadSourcesFromDir(filePath, relativeFilePath);
        }
        const body = await readFile(filePath, 'utf-8');
        return [ new ProjectSource(relativeFilePath, body) ];
    }
}
