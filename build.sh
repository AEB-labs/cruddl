#!/bin/env bash
set -euxo pipefail
rimraf dist
tsc --skipLibCheck
cpy --flat src/schema/preparation/source-validation-modules/schema dist/src/schema/preparation/source-validation-modules/schema
node ./emit-cruddl-version.js
# check e.g. for imports from modules that are not listed as dependencies
npm run knip
npm run knip:prod
