const fs = require('fs');
const cruddlVersion = require('./package.json').version;

const mockVersion = '0.0.0-local-dev';
const path = './dist/src/cruddl-version.js';
const oldContents = fs.readFileSync(path, 'utf8');
const newContents = oldContents.replace(mockVersion, cruddlVersion);
fs.writeFileSync('./dist/src/cruddl-version.js', newContents);
