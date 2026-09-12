/**
 * Structural gate for app/plan.json — the half of verification that needs no
 * corpus, so CI can run it on every push.
 *
 * src/verify.mjs is the real whole-Bible gate, but it needs the WEB USFM text
 * downloaded, which makes it a poor fit for a deploy that must not be blocked
 * by ebible.org being slow. That check runs on its own workflow. This one is
 * hermetic: it validates the plan against app/books.json, which ships with the
 * app, and it catches the failures that would actually reach the reader —
 * a duplicate seq, a reading with no reference, a chapter that does not exist.
 *
 *   node src/check-plan.mjs
 */
import { readFileSync } from 'node:fs';

const url = (p) => new URL(p, import.meta.url);
const plan = JSON.parse(readFileSync(url('../app/plan.json')));
const books = JSON.parse(readFileSync(url('../app/books.json')));

const BOOK = new Map();                       // full name → { chapters, verses[] }
for (const [, name, short, , chapters, single, verses] of books) {
  const rec = { name, chapters, single: !!single, verses };
  BOOK.set(name.toLowerCase(), rec);
  BOOK.set(short.toLowerCase(), rec);
}

const fail = [];
const note = (m) => fail.push(m);

if (!plan.version) note('plan.json has no version');
if (plan.translation !== 'ESV') note(`translation is ${plan.translation}, expected ESV`);
if (!Array.isArray(plan.plans) || !plan.plans.length) note('plan.json carries no plans');

/** "1 Samuel 3:1-14" → { book: "1 Samuel", sc, sv, ec, ev }; null if unparseable. */
function parse(ref) {
  const m = /^((?:[1-3]\s)?[A-Za-z][A-Za-z ]*?)\s+(\d+)(?::(\d+))?(?:\s*[-–]\s*(?:(\d+):)?(\d+))?$/.exec(ref.trim());
  if (!m) return null;
  const [, book, a, b, c, d] = m;
  // Without a colon the numbers are chapters for a multi-chapter book and
  // verses for a one-chapter book (Obadiah 1-9 is verses, Revelation 17 is a
  // chapter) — the same ambiguity the reader has to resolve.
  const rec = BOOK.get(book.trim().toLowerCase());
  if (!rec) return { book: book.trim(), unknown: true };
  if (b === undefined) {
    return rec.single
      ? { book: rec.name, sc: 1, sv: +a, ec: 1, ev: d ? +d : +a }
      : { book: rec.name, sc: +a, sv: 1, ec: d ? +d : +a, ev: null };
  }
  return { book: rec.name, sc: +a, sv: +b, ec: c ? +c : +a, ev: d ? +d : +b };
}

for (const pl of plan.plans) {
  const tag = pl.id.toUpperCase();
  const movements = new Set(pl.movements.map((m) => m.id));
  const seqs = new Set(), days = new Map(), ids = new Set();

  pl.entries.forEach((e, i) => {
    const at = `${tag} ${e.id || '#' + i}`;

    if (e.seq !== i + 1) note(`${at}: seq ${e.seq} is out of order at position ${i + 1}`);
    if (seqs.has(e.seq)) note(`${at}: duplicate seq ${e.seq}`);
    seqs.add(e.seq);

    if (ids.has(e.id)) note(`${at}: duplicate id`);
    ids.add(e.id);

    if (e.day == null) note(`${at}: no day`);
    else if (days.has(e.day)) note(`${at}: day ${e.day} already used by ${days.get(e.day)}`);
    else days.set(e.day, e.id);

    if (!movements.has(e.movement)) note(`${at}: movement ${e.movement} is not declared`);
    if (!e.passage) note(`${at}: no passage label`);

    if (e.type === 'review') {
      if (e.ref) note(`${at}: a review should have no ref, found "${e.ref}"`);
      return;
    }
    if (!e.ref) return note(`${at}: ${e.type} "${e.passage}" has no ESV query`);

    const r = parse(e.ref);
    if (!r) return note(`${at}: cannot parse ref "${e.ref}"`);
    if (r.unknown) return note(`${at}: "${r.book}" is not a book in books.json`);
    const rec = BOOK.get(r.book.toLowerCase());
    if (r.sc < 1 || r.sc > rec.chapters || r.ec < 1 || r.ec > rec.chapters)
      note(`${at}: "${e.ref}" names a chapter outside ${r.book} (1–${rec.chapters})`);
    if (r.ec < r.sc) note(`${at}: "${e.ref}" ends before it starts`);
    // Terminal readings deliberately over-request verses so the ESV can clamp
    // to its own canonical range (WEB and ESV disagree on the Romans
    // doxology), so an end verse past the book's count is expected — but only
    // within the padding window.
    const cap = rec.verses[r.ec - 1];
    if (r.ev != null && cap && r.ev > cap + 12)
      note(`${at}: "${e.ref}" over-requests ${r.ev - cap} verses past ${r.book} ${r.ec}:${cap}`);
  });

  const readings = pl.entries.filter((e) => e.type !== 'review').length;
  console.log(`${tag.padEnd(3)} ${String(pl.entries.length).padStart(5)} entries  ` +
              `${String(readings).padStart(5)} readings  ${pl.movements.length} movements`);
}

if (fail.length) {
  console.error(`\nFAILED — ${fail.length} problem${fail.length === 1 ? '' : 's'}:`);
  for (const f of fail.slice(0, 40)) console.error('  ' + f);
  if (fail.length > 40) console.error(`  …and ${fail.length - 40} more`);
  process.exit(1);
}
console.log('\nPASS — structure, movements, ids, days and every reference check out');
