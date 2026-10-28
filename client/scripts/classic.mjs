import { readFile, writeFile } from 'node:fs/promises';
const file = new URL('../dist/index.html', import.meta.url);
let html = await readFile(file, 'utf8');
html = html.replace(/<script\b[^>]*\btype="module"[^>]*\bsrc="([^"]+)"[^>]*><\/script>/i,
  (_all, src) => `<script defer src="${src}"></script>`);
await writeFile(file, html);
