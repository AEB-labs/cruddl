import { Ajv } from 'ajv';
import standaloneCode from 'ajv/dist/standalone/index.js';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const schemaPath = 'src/core/schema/preparation/source-validation-modules/schema/schema.json';
const validatorPath =
    'src/core/schema/preparation/source-validation-modules/schema/validate-schema.js';
const validatorCjsPath =
    'src/core/schema/preparation/source-validation-modules/schema/validate-schema.cjs';
const dtsPath = 'src/core/schema/preparation/source-validation-modules/schema/validate-schema.d.ts';

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(scriptDir, '..');

function resolveFromProjectRoot(relativePath) {
    return path.resolve(projectRoot, relativePath);
}

function readSchema(schemaFilePath) {
    const schemaAbsPath = resolveFromProjectRoot(schemaFilePath);
    return JSON.parse(fs.readFileSync(schemaAbsPath, 'utf8'));
}

function createAjv({ esm }) {
    return new Ajv({
        allErrors: true,
        code: {
            esm,
            source: true,
        },
    });
}

function generateValidatorCode(schema, { esm }) {
    const ajv = createAjv({ esm });
    const validate = ajv.compile(schema);
    return standaloneCode(ajv, validate);
}

function generateEsmValidatorCode(schema) {
    const generatedCode = generateValidatorCode(schema, { esm: true });
    return rewriteRequireStatementsToImports(generatedCode);
}

function generateCjsValidatorCode(schema) {
    return generateValidatorCode(schema, { esm: false });
}

function rewriteRequireStatementsToImports(code) {
    // Fix ajv's ESM bug: convert require() statements to ESM imports.
    // https://github.com/ajv-validator/ajv/issues/2209
    const requireStatements = [];
    const requireRegex = /const\s+(\w+)\s*=\s*require\(['"]([^'"]+)['"]\)(\.default)?;?/g;
    let match;

    while ((match = requireRegex.exec(code)) !== null) {
        const [fullMatch, varName, modulePath, hasDefault] = match;
        requireStatements.push({ fullMatch, varName, modulePath, hasDefault });
    }

    if (requireStatements.length === 0) {
        return code;
    }

    const imports = requireStatements
        .map(({ varName, modulePath, hasDefault }) => {
            if (!hasDefault) {
                return `import * as ${varName} from '${modulePath}';`;
            }

            const moduleNamespaceName = `__${varName}Module`;
            // ESM<->CJS default interop is not consistent across toolchains.
            // See: https://esbuild.github.io/content-types/#default-interop
            //
            // In practice, consumers that bundle cruddl with esbuild (for example Angular builds)
            // may expose this CJS default as either `ns.default` or `ns.default.default`.
            // Resolve both shapes so the generated ESM validator is robust in library builds.
            return [
                `import * as ${moduleNamespaceName} from '${modulePath}';`,
                `const ${varName} = ${moduleNamespaceName}?.default?.default ?? ${moduleNamespaceName}?.default ?? ${moduleNamespaceName};`,
            ].join('\n');
        })
        .join('\n');

    let rewrittenCode = code;
    requireStatements.forEach(({ fullMatch }) => {
        rewrittenCode = rewrittenCode.replace(fullMatch, '');
    });

    if (rewrittenCode.includes("'use strict';")) {
        return rewrittenCode.replace("'use strict';", `'use strict';\n${imports}`);
    }

    return `${imports}\n${rewrittenCode}`;
}

function extractDefaultExportName(code) {
    const defaultExportMatch = code.match(/export default\s+([A-Za-z0-9_]+)/);
    return defaultExportMatch ? defaultExportMatch[1] : 'validate';
}

function generateDtsContent(exportName) {
    return `import type { ValidateFunction } from 'ajv';\n\ndeclare const ${exportName}: ValidateFunction;\n\nexport default ${exportName};\n`;
}

function main() {
    const schema = readSchema(schemaPath);
    const cjsCode = generateCjsValidatorCode(schema);
    const esmCode = generateEsmValidatorCode(schema);
    const validatorAbsPath = resolveFromProjectRoot(validatorPath);
    const validatorCjsAbsPath = resolveFromProjectRoot(validatorCjsPath);
    const dtsAbsPath = resolveFromProjectRoot(dtsPath);

    fs.writeFileSync(validatorCjsAbsPath, cjsCode);
    console.log(`Wrote ${validatorCjsAbsPath}`);

    fs.writeFileSync(validatorAbsPath, esmCode);
    console.log(`Wrote ${validatorAbsPath}`);

    const exportName = extractDefaultExportName(esmCode);
    const dts = generateDtsContent(exportName);
    fs.writeFileSync(dtsAbsPath, dts);
    console.log(`Wrote ${dtsAbsPath}`);
}

main();
