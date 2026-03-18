#!/bin/env bash
set -euxo pipefail
rm -rf dist

tsc -p tsconfig.build.cjs.json
tsc -p tsconfig.build.esm.json

printf '{"type":"commonjs"}\n' > dist/cjs/package.json

mkdir dist/esm/core/schema/preparation/source-validation-modules/schema
cp src/core/schema/preparation/source-validation-modules/schema/validate-schema.js dist/esm/core/schema/preparation/source-validation-modules/schema/validate-schema.js
mkdir dist/cjs/core/schema/preparation/source-validation-modules/schema
cp src/core/schema/preparation/source-validation-modules/schema/validate-schema.cjs dist/cjs/core/schema/preparation/source-validation-modules/schema/validate-schema.js
node ./scripts/emit-cruddl-version.js

npm run knip
npm run knip:prod
