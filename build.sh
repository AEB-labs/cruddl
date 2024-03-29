#!/bin/env bash
set -euxo pipefail
rimraf dist
tsc --skipLibCheck
cpy --flat src/schema/preparation/source-validation-modules/schema dist/src/schema/preparation/source-validation-modules/schema
node ./emit-cruddl-version.js
dependency-check ./package.json --no-dev --ignore-module @arangodb --ignore-module internal
