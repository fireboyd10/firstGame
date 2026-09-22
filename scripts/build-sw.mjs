import { createHash } from 'node:crypto';
import { readdir, readFile, writeFile } from 'node:fs/promises';
import { resolve, relative, sep } from 'node:path';

const project = resolve(import.meta.dirname, '..');
const output = resolve(project, 'dist');
async function walk(directory) {
  const entries = await readdir(directory, { withFileTypes: true });
  const files = await Promise.all(entries.map((entry) => {
    const path = resolve(directory, entry.name);
    return entry.isDirectory() ? walk(path) : [path];
  }));
  return files.flat();
}

const files = (await walk(output))
  .map((file) => relative(output, file).split(sep).join('/'))
  .filter((file) => file !== 'service-worker.js')
  .sort();
if (!files.includes('index.html') || !files.includes('manifest.webmanifest')) {
  throw new Error('Build the application with Vite before generating the service worker.');
}
const template = await readFile(resolve(project, 'public/service-worker.js'), 'utf8');
const hash = createHash('sha256').update(template);
for (const file of files) {
  hash.update(file).update('\0').update(await readFile(resolve(output, file))).update('\0');
}
const version = hash.digest('hex').slice(0, 16);
const worker = template
  .replace('__RFR_BUILD_VERSION__', version)
  .replace('__RFR_PRECACHE_MANIFEST__', JSON.stringify(files));
if (/__RFR_/.test(worker)) throw new Error('An unresolved service-worker build token remains.');
await writeFile(resolve(output, 'service-worker.js'), worker);
console.log(`Offline shell: ${files.length} local files, release ${version}.`);
