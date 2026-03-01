import Ajv from 'ajv';
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
const generated = standaloneCode(ajv, validate);
fs.writeFileSync(validatorPath, generated);

const generatedForTyping = fs.readFileSync(validatorPath, 'utf8');
const defaultExportMatch = generatedForTyping.match(/export default\s+([A-Za-z0-9_]+)/);
const exportName = defaultExportMatch ? defaultExportMatch[1] : 'validate';

const dts = `import { ValidateFunction } from 'ajv';\n\ndeclare const ${exportName}: ValidateFunction;\n\nexport default ${exportName};\n`;
fs.writeFileSync(dtsPath, dts);
