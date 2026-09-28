import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import ts from 'typescript';

const project = resolve(import.meta.dirname, '..');
// Transpile the data module itself: party-scenarios.ts is a re-export shim, and
// Node cannot resolve relative imports from a data: URL base (ERR_UNSUPPORTED_RESOLVE_REQUEST).
const compiled = ts.transpileModule(await readFile(resolve(project, 'src/data/scenario-bank.ts'), 'utf8'), {
  compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2020 },
}).outputText;
const { partyScenarios: scenarios } = await import(`data:text/javascript;base64,${Buffer.from(compiled).toString('base64')}`);
if (!Array.isArray(scenarios) || scenarios.length < 10 || scenarios.some((card) => !card.text || !['red', 'green'].includes(card.answer))) {
  throw new Error('Scenario content is invalid.');
}
const output = resolve(project, 'server/data');
await mkdir(output, { recursive: true });
await writeFile(resolve(output, 'scenarios.json'), `${JSON.stringify(scenarios)}\n`);
console.log(`Party server ready: ${scenarios.length} dating scenarios.`);
