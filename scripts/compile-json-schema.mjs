import { Ajv } from 'ajv';
import standaloneCode from 'ajv/dist/standalone/index.js';
import fs from 'node:fs';
import path from 'node:path';

const schemaPath = 'src/schema/preparation/source-validation-modules/schema/schema.json';
const validatorPath = 'src/schema/preparation/source-validation-modules/schema/validate-schema.js';
const dtsPath = 'src/schema/preparation/source-validation-modules/schema/validate-schema.d.ts';

const schemaAbsPath = path.resolve(process.cwd(), schemaPath);
const schema = JSON.parse(fs.readFileSync(schemaAbsPath, 'utf8'));

const ajv = new Ajv({
    allErrors: true,
    code: {
        esm: true,
        source: true,
    },
});

const validate = ajv.compile(schema);
let generated = standaloneCode(ajv, validate);

// Fix ajv's ESM bug: convert require() statements to ESM imports
// https://github.com/ajv-validator/ajv/issues/2209
const requireStatements = [];
const requireRegex = /const\s+(\w+)\s*=\s*require\(['"]([^'"]+)['"]\)(\.default)?;?/g;
let match;

while ((match = requireRegex.exec(generated)) !== null) {
    const [fullMatch, varName, modulePath, hasDefault] = match;
    requireStatements.push({ fullMatch, varName, modulePath, hasDefault });
}

if (requireStatements.length > 0) {
    // Generate import statements
    const imports = requireStatements
        .map(({ varName, modulePath, hasDefault }) => {
            if (hasDefault) {
                return `import ${varName} from '${modulePath}';`;
            } else {
                return `import * as ${varName} from '${modulePath}';`;
            }
        })
        .join('\n');

    // Remove the require statements from the code
    requireStatements.forEach(({ fullMatch }) => {
        generated = generated.replace(fullMatch, '');
    });

    // Add imports after 'use strict' if present, otherwise at the top
    if (generated.includes("'use strict';")) {
        generated = generated.replace("'use strict';", `'use strict';\n${imports}`);
    } else {
        generated = `${imports}\n${generated}`;
    }
}

fs.writeFileSync(validatorPath, generated);

const generatedForTyping = fs.readFileSync(validatorPath, 'utf8');
const defaultExportMatch = generatedForTyping.match(/export default\s+([A-Za-z0-9_]+)/);
const exportName = defaultExportMatch ? defaultExportMatch[1] : 'validate';

const dts = `import type { ValidateFunction } from 'ajv';\n\ndeclare const ${exportName}: ValidateFunction;\n\nexport default ${exportName};\n`;
fs.writeFileSync(dtsPath, dts);
