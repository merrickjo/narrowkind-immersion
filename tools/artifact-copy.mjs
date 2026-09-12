/**
 * app/index.html is a real standalone document, because that is what the
 * Worker serves and what installs on the e-ink device. The Artifact host
 * supplies its own <!doctype>/<head>/<body> skeleton and forbids the page
 * from carrying one, and a service worker on that origin would outlive the
 * preview — so the Artifact copy is derived, never hand-maintained.
 *
 *   node tools/artifact-copy.mjs [outDir]      # default build/artifact
 */
import { mkdir, readFile, writeFile, copyFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const out = process.argv[2] ?? join(root, 'build', 'artifact');

let html = await readFile(join(root, 'app', 'index.html'), 'utf8');

const cut = (re, what) => {
  const before = html.length;
  html = html.replace(re, '');
  if (html.length === before) throw new Error(`artifact-copy: could not find ${what} — did the shell change?`);
};

cut(/^<!doctype html>\s*<html[^>]*>\s*<head>\s*/i, 'the opening shell');
cut(/<meta charset="utf-8">\s*/i, 'the charset meta');
cut(/<meta name="viewport"[^>]*>\s*/i, 'the viewport meta');
cut(/<link rel="manifest"[^>]*>\s*/i, 'the manifest link');
cut(/<link rel="icon"[^>]*>\s*/i, 'the icon link');
cut(/<meta name="(mobile-web-app-capable|apple-mobile-web-app-capable|apple-mobile-web-app-status-bar-style)"[^>]*>\s*/gi,
    'the web-app metas');
cut(/<\/head>\s*<body>\s*/i, 'the head/body boundary');
cut(/<script>\s*\/\* Offline is the point[\s\S]*?<\/script>\s*/, 'the service-worker registration');
cut(/<\/body>\s*<\/html>\s*$/i, 'the closing shell');

if (/<!doctype|<html|<head|<body/i.test(html)) throw new Error('artifact-copy: shell tags survived');

await mkdir(out, { recursive: true });
await writeFile(join(out, 'index.html'), html.trimStart());
for (const f of ['plan.json', 'books.json']) await copyFile(join(root, 'app', f), join(out, f));
console.log(`artifact copy → ${out} (${html.length} bytes)`);
