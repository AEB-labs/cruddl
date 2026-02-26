#!/bin/env bash
set -euxo pipefail
rimraf dist
tsc -p tsconfig.build.cjs.json --skipLibCheck
tsc -p tsconfig.build.esm.json --skipLibCheck
cpy --flat src/schema/preparation/source-validation-modules/schema dist/cjs/src/schema/preparation/source-validation-modules/schema
cpy --flat src/schema/preparation/source-validation-modules/schema dist/esm/src/schema/preparation/source-validation-modules/schema
node ./emit-cruddl-version.js
# check e.g. for imports from modules that are not listed as dependencies
npm run knip
npm run knip:prod
