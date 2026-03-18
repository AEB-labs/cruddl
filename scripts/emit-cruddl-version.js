import fs from 'fs';
import { join } from 'path';

const packageJson = JSON.parse(
    fs.readFileSync(join(import.meta.dirname, '../package.json'), 'utf8'),
);
const cruddlVersion = packageJson.version;

const mockVersion = '0.0.0-local-dev';
const targets = ['./dist/cjs/core/version.js', './dist/esm/core/version.js'];

for (const path of targets) {
    const oldContents = fs.readFileSync(path, 'utf8');
    const newContents = oldContents.replace(mockVersion, cruddlVersion);
    fs.writeFileSync(path, newContents);
}
