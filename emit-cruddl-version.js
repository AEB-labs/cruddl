const fs = require('fs');
const cruddlVersion = require('./package.json').version;

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
