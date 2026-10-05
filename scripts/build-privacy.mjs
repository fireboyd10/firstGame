import { readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';

const root = resolve(import.meta.dirname, '..');
const source = await readFile(resolve(root, 'PRIVACY.md'), 'utf8');
const escape = (value) => value.replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[char]);
const inline = (value) => escape(value)
  .replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>')
  .replace(/\[([^\]]+)\]\((https:\/\/[^\s)]+|mailto:[^\s)]+)\)/g, '<a href="$2">$1</a>');
const body = source.trim().split(/\r?\n\s*\r?\n/).map(paragraph => {
  if (paragraph.startsWith('# ')) return `<h1>${inline(paragraph.slice(2))}</h1>`;
  return `<p>${inline(paragraph)}</p>`;
}).join('\n');
const html = `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>Red Flag Rush privacy policy</title>
  <meta name="description" content="Privacy policy and support contact for Red Flag Rush.">
  <style>
    :root { color-scheme: dark; }
    body { margin: 0; padding: 20px; color: #fff0d7; background: #18111d; font: 16px/1.65 system-ui, sans-serif; }
    main { max-width: 760px; margin: auto; }
    h1 { font-size: 1.7rem; line-height: 1.25; }
    a { color: #ff9bb9; overflow-wrap: anywhere; }
    p { overflow-wrap: anywhere; }
  </style>
</head>
<body><main>
${body}
</main></body>
</html>
`;
await writeFile(resolve(root, 'public/privacy.html'), html);
console.log('Generated bundled/public privacy policy from PRIVACY.md.');
