/**
 * Post-deploy smoke test against the live Worker.
 *
 * The unit tests pin the parser against a saved fixture, which is exactly the
 * kind of test that cannot fail when the wrong build is deployed, or when the
 * edge is still serving a cached response cut by an older parser. Both of
 * those happened. So this runs against the real URL and asserts verse counts
 * the ESV must return.
 *
 *   node tools/smoke.mjs [base-url]
 */
const BASE = (process.argv[2] || 'https://narrowkind-scripture.merrickjo.workers.dev').replace(/\/+$/, '');

const CASES = [
  // Poetry with compound verse classes — the shape that collapsed to one
  // verse when a stale parser was live.
  { q: 'Psalm 23', verses: 6, heading: true },
  { q: 'Romans 1:1-17', verses: 17 },
  // Padded terminal reading: the ESV clamps 16:35 to its own canonical 16:27.
  { q: 'Romans 16:17-16:35', verses: 10, reference: /16:17.*27/ },
  { q: 'Psalm 119:1-8', verses: 8 },       // acrostic stanza
  { q: 'Obadiah 1-9', verses: 9 },         // single-chapter book
  { q: 'Joshua 1:16-2:13', verses: 16 },   // crosses a chapter
];

const fail = [];
const get = async (path, tries = 4) => {
  for (let i = 1; ; i++) {
    try {
      const r = await fetch(BASE + path, { headers: { 'User-Agent': 'narrowkind-smoke' } });
      if (r.ok || i === tries) return r;
    } catch (e) { if (i === tries) throw e; }
    await new Promise((s) => setTimeout(s, 1500 * i));   // deploy propagation
  }
};

const health = await (await get('/health')).json();
if (!health.ok) fail.push('/health is not ok');
if (!health.esv) fail.push('/health reports no ESV key on the Worker');
console.log(`health      ok=${health.ok} esv=${health.esv} notion=${health.notion}`);

const page = await get('/');
const html = await page.text();
if (!page.ok) fail.push(`/ returned ${page.status}`);
if (!/<meta charset="utf-8">/i.test(html)) fail.push('/ is missing its charset declaration');
if (!/<!doctype html>/i.test(html)) fail.push('/ is not a complete document');
if (!/id="flow"/.test(html)) fail.push('/ does not look like the reader');
console.log(`shell       ${page.status} ${html.length} bytes`);

for (const f of ['/plan.json', '/books.json', '/sw.js', '/manifest.json', '/icon.svg']) {
  const r = await get(f);
  if (!r.ok) fail.push(`${f} returned ${r.status}`);
}
console.log('assets      plan, books, sw, manifest, icon all served');

for (const c of CASES) {
  const r = await get('/passage?q=' + encodeURIComponent(c.q));
  const d = await r.json().catch(() => null);
  if (!r.ok || !d || d.error) { fail.push(`${c.q}: ${d?.error || r.status}`); continue; }
  const n = d.passage.verses.length;
  const mark = n === c.verses ? 'ok  ' : 'BAD ';
  if (n !== c.verses) fail.push(`${c.q}: ${n} verses, expected ${c.verses}`);
  if (c.reference && !c.reference.test(d.passage.reference))
    fail.push(`${c.q}: canonical reference came back as "${d.passage.reference}"`);
  if (c.heading && !d.passage.verses[0].heading)
    fail.push(`${c.q}: the section heading did not survive parsing`);
  if (d.passage.verses.some((v) => !v.text || !v.text.trim()))
    fail.push(`${c.q}: at least one verse came back empty`);
  console.log(`${mark}        ${d.passage.reference.padEnd(24)} ${n} verses`);
}

if (fail.length) {
  console.error(`\nSMOKE FAILED against ${BASE}:`);
  for (const f of fail) console.error('  ' + f);
  process.exit(1);
}
console.log(`\nPASS — ${BASE} is serving the reader and the ESV correctly`);
