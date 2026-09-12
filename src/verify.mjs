/** Whole-Bible verification gate for app/plan.json. */
import { readFileSync } from 'node:fs';
import { coverage } from './coverage.mjs';
import { ABBR } from './refs.mjs';

const plan = JSON.parse(readFileSync(new URL('../app/plan.json', import.meta.url)));
const refs = plan.plans.flatMap((p) => p.entries.filter((e) => e.ref).map((e) => e.ref));
const { report, unparsed } = coverage(refs);

const fail = [];
if (unparsed.length) fail.push(`unparseable references: ${unparsed.join(', ')}`);

const books = new Set(Object.values(ABBR));
const seen = new Set(report.map((r) => r.book));
const missingBooks = [...books].filter((b) => !seen.has(b));
if (missingBooks.length) fail.push(`books absent from the plan: ${missingBooks.join(', ')}`);

const KNOWN = {
  Mark: ['16:9-16:20'],          // longer ending — left out deliberately
  // WEB prints the Romans doxology at 14:24-26; the ESV prints it at
  // 16:25-27, which the padded terminal reading covers. Artefact of the
  // WEB-based verifier, not a hole in the plan.
  Romans: ['14:24-14:26'],
  John: ['7:53'],                // falls between the plan's John 7:45-52 and 8:1-11
  '3 John': [],                  // WEB counts 14 verses, ESV 15
};
const gaps = report.filter((r) => r.gaps.length && JSON.stringify(r.gaps) !== JSON.stringify(KNOWN[r.book] || null));

console.log(`books in plan        ${report.length} / 66`);
console.log(`readings with a ref  ${refs.length}`);
const totalV = report.reduce((n, r) => n + r.total, 0);
const covV = report.reduce((n, r) => n + r.covered, 0);
console.log(`verse coverage       ${covV} / ${totalV}  (${(100 * covV / totalV).toFixed(2)}%)`);

if (gaps.length) {
  console.log('\nremaining gaps:');
  for (const r of gaps) console.log('  ', r.book.padEnd(16), r.gaps.join(', '));
} else console.log('\nno unexplained gaps');

for (const [book, g] of Object.entries(KNOWN)) {
  const r = report.find((x) => x.book === book);
  if (r && g.length) console.log(`known omission       ${book} ${g.join(', ')}`);
}

// seq/day integrity
for (const p of plan.plans) {
  const seqs = p.entries.map((e) => e.seq);
  if (new Set(seqs).size !== seqs.length) fail.push(`${p.id}: duplicate seq`);
  if (seqs.some((s, i) => s !== i + 1)) fail.push(`${p.id}: seq not contiguous from 1`);
  const days = p.entries.filter((e) => e.day != null).map((e) => e.day);
  if (new Set(days).size !== days.length) fail.push(`${p.id}: duplicate day`);
  const notionDays = p.entries.filter((e) => e.notion).map((e) => e.day);
  if (notionDays.some((d) => d == null)) fail.push(`${p.id}: Notion-backed entry with no day`);
}

if (fail.length) { console.error('\nFAILED:\n' + fail.map((f) => '  ' + f).join('\n')); process.exit(1); }
console.log('\nPASS');
