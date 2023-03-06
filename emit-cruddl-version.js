const fs = require('fs');
const cruddlVersion = require('./package.json').version;

const contents = `export const CRUDDL_VERSION = ${JSON.stringify(cruddlVersion)};\n`
fs.writeFileSync('./dist/src/cruddl-version.js', contents);
