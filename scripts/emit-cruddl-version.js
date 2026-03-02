import fs from 'fs';
import { join } from 'path';

const packageJson = JSON.parse(
    fs.readFileSync(join(import.meta.dirname, '../package.json'), 'utf8'),
);
const cruddlVersion = packageJson.version;

const mockVersion = '0.0.0-local-dev';
const targets = ['./dist/cjs/src/cruddl-version.js', './dist/esm/src/cruddl-version.js'];

for (const path of targets) {
    if (!fs.existsSync(path)) {
        continue;
    }
    const oldContents = fs.readFileSync(path, 'utf8');
    const newContents = oldContents.replace(mockVersion, cruddlVersion);
    fs.writeFileSync(path, newContents);
}
