// Use the installed, lockfile-pinned CLI; never implicitly download another version.
import { spawnSync } from 'node:child_process';
import { createRequire } from 'node:module';

const [major, minor] = process.versions.node.split('.').map(Number);
if (major < 22 || (major === 22 && minor < 12)) {
  console.error('Native Android/iOS tooling requires Node 22.12+ (Node 24 LTS recommended). Existing web commands remain available on Node 20.19.');
  process.exit(1);
}

const require = createRequire(import.meta.url);
const [command, platform] = process.argv.slice(2);
if (!['add', 'sync', 'open', 'run', 'doctor'].includes(command) || (platform && !['android', 'ios'].includes(platform))) {
  console.error('Usage: node scripts/mobile.mjs <add|sync|open|run|doctor> [android|ios]');
  process.exit(1);
}
if (platform === 'ios' && process.platform !== 'darwin') {
  console.error('Creating, syncing, opening, and running the iOS project requires macOS and Xcode. See docs/MOBILE.md.');
  process.exit(1);
}

function run(script, args) {
  const result = spawnSync(process.execPath, [script, ...args], { stdio: 'inherit' });
  if (result.error) console.error(result.error.message);
  if (result.status !== 0) process.exit(result.status ?? 1);
}

// Always copy a fresh, checked web build into native projects.
if (['add', 'sync', 'run'].includes(command)) {
  if (!process.env.npm_execpath) {
    console.error('Run this command through its npm script; see docs/MOBILE.md.');
    process.exit(1);
  }
  run(process.env.npm_execpath, ['run', 'build']);
}
const target = platform || (command === 'sync' && process.platform !== 'darwin' ? 'android' : undefined);
run(require.resolve('@capacitor/cli/bin/capacitor'), [command, ...(target ? [target] : [])]);
