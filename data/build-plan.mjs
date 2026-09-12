/**
 * Builds app/plan.json.
 *
 * Sources
 *   data/nt.txt, data/nt-marks.txt      — NT plan, extracted from Notion
 *   data/ot.txt, data/ot-marks.txt      — OT Torah (Triad 1), extracted from Notion
 *   src/build-ot.mjs                    — OT Triads 2-6, generated (see that file)
 *
 * Fields
 *   seq      reading order in the app — always present, always unique
 *   day      the Notion row key. null for entries with no Notion row yet.
 *   notion   whether a Notion row exists to write a note back to
 */
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildOtTail, buildNtCompletions } from '../src/build-ot.mjs';

const here = dirname(fileURLToPath(import.meta.url));
const read = (f) => readFileSync(join(here, f), 'utf8').trim().split('\n').filter(Boolean);

const MOVEMENTS = {
  nt: [
    { id: 1,  title: 'The Righteousness Revolution', strands: ['Romans', 'Galatians', 'Hebrews'],
      note: 'How God sets the world right — argued, contested, and consummated.' },
    { id: 2,  title: 'The Apocalyptic Imagination', strands: ['Revelation', '1 Peter', 'Mark'],
      note: 'Seeing the present age through unveiled eyes; suffering as the shape of witness.' },
    { id: 3,  title: 'The Incarnate Word', strands: ['John', 'Philippians', 'Colossians', 'James'],
      note: 'The Word made flesh, and what flesh then does.' },
    { id: 90, title: 'Passion Synthesis', strands: ['Mark', 'John'],
      note: 'The two passion accounts read against each other.' },
    { id: 4,  title: 'The Kingdom Embodied', strands: ['Matthew', '1 Corinthians', 'Ephesians'],
      note: 'The kingdom taught, then worked out in a fractious congregation.' },
    { id: 5,  title: 'The Witness Unfolds', strands: ['Luke', '2 Corinthians', 'Acts'],
      note: 'One long account of how the news travelled, and what it cost.' },
    { id: 99, title: 'The Letters That Remain', strands: ['1–2 Thessalonians', 'Pastorals', 'Catholic Epistles'],
      note: 'The shorter letters, read as an epilogue rather than an afterthought.' },
  ],
  ot: [
    { id: 1, title: 'Covenant', strands: ['Genesis', 'Exodus', 'Leviticus', 'Numbers', 'Deuteronomy'],
      note: 'The Torah read straight through, one sitting a day.' },
    { id: 2, title: 'Kingdom', strands: ['Joshua', 'Judges', 'Ruth', 'Samuel', 'Kings', 'Chronicles'],
      note: 'Land, judges, throne — and the long argument about whether any of it held.' },
    { id: 3, title: 'Exile', strands: ['Ezra', 'Nehemiah', 'Esther', 'Lamentations', 'Daniel'],
      note: 'Faith kept where the temple is rubble and the court is foreign.' },
    { id: 4, title: 'Prophets', strands: ['Isaiah', 'Jeremiah', 'Ezekiel', 'The Twelve'],
      note: 'The covenant lawsuit, and the promise that outlives the verdict.' },
    { id: 5, title: 'Promised One', strands: ['Psalms'],
      note: 'Israel’s prayerbook, which is also its christology.' },
    { id: 6, title: 'Wisdom', strands: ['Job', 'Proverbs', 'Ecclesiastes', 'Song of Solomon'],
      note: 'What the fear of the LORD looks like when the world refuses to be tidy.' },
  ],
};

const BOOK_OF = (p) => (p.match(/^((?:[1-3]\s)?[A-Za-z][A-Za-z ]*?)\s+\d/) || [, p.trim()])[1].trim();

const parseReadings = (file, plan) => read(file).map((line) => {
  const [day, week, mv, passage] = line.split('|');
  return { plan, day: +day, week: +week, movement: +mv, type: 'reading',
           passage, book: BOOK_OF(passage), ref: passage, notion: true };
});

const parseMarks = (file, plan) => read(file).map((line) => {
  const [day, week, mv, type, label, books] = line.split('|');
  const t = type === 'V' ? 'review' : type === 'X' ? 'extended' : type === 'F' ? 'reflect' : 'reading';
  return { plan, day: +day, week: +week, movement: +mv, type: t, passage: label,
           book: (books || '').split(',')[0]?.trim() || null,
           covers: (books || '').split(',').map((s) => s.trim()).filter(Boolean),
           ref: t !== 'review' && /\d\s*$/.test(label) ? label : null, notion: true };
});

const byDay = (a, b) => (a.day - b.day) || String(a.passage).localeCompare(String(b.passage));

// ---- New Testament -----------------------------------------------------
const nt = [...parseReadings('nt.txt', 'nt'), ...parseMarks('nt-marks.txt', 'nt')].sort(byDay);
const completions = buildNtCompletions();

/** Splice generated entries in immediately after the entry on `afterDay`. */
function spliceAfter(list, afterDay, made, meta) {
  const at = list.findIndex((e) => e.day === afterDay);
  if (at < 0) throw new Error(`no entry on day ${afterDay} to splice after`);
  const rows = made.map((r) => ({
    plan: meta.plan, day: null, week: list[at].week, movement: list[at].movement,
    type: 'reading', passage: r.passage, book: r.book, ref: r.ref || r.passage,
    verses: r.verses, generated: true, notion: false, reason: meta.reason,
  }));
  list.splice(at + 1, 0, ...rows);
  return rows.length;
}
spliceAfter(nt, 100, completions.romans, { plan: 'nt', reason: 'completes Romans (plan ended at 14:23)' });
spliceAfter(nt, 207, completions.revelation, { plan: 'nt', reason: 'completes Revelation (plan ended at 16:11)' });

// ---- Old Testament -----------------------------------------------------
const otTorah = [...parseReadings('ot.txt', 'ot'), ...parseMarks('ot-marks.txt', 'ot')].sort(byDay);
spliceAfter(otTorah, 46, [{ passage: 'Genesis 22:20-24', book: 'Genesis', verses: 5 }],
  { plan: 'ot', reason: 'fills gap between Gen 22:1-19 and Gen 23:1-20' });

const otTail = buildOtTail({ startWeek: 59 }).map((e) => ({ ...e, plan: 'ot', ref: e.type === 'reading' ? (e.ref || e.passage) : null }));
const ot = [...otTorah, ...otTail];

// ---- sequence, assemble ------------------------------------------------
const finish = (list) => list.map((e, i) => ({ ...e, id: `${e.plan}-s${i + 1}`, seq: i + 1 }));

const plan = {
  version: '2.0.0',
  generated: new Date().toISOString().slice(0, 10),
  translation: 'ESV',
  method: 'Reading units are whole WEB-USFM paragraphs/stanzas, merged to the NT plan’s measured load (median 15 verses). No paragraph is ever split.',
  plans: [
    { id: 'nt', name: 'New Testament', label: 'Narrowkind NT Reading Plan',
      source: 'Notion · C EXEGESIS: Narrowkind NT Reading Plan',
      movements: MOVEMENTS.nt, entries: finish(nt) },
    { id: 'ot', name: 'Old Testament', label: 'Narrowkind OT Reading Plan',
      source: 'Notion · C EXEGESIS: Narrowkind OT Reading Plan (Triad 1) + generated Triads 2–6',
      movements: MOVEMENTS.ot, entries: finish(ot) },
  ],
};

// ---- verification gate -------------------------------------------------
const problems = [];
const fromNotion = { nt: 519, ot: 440 };
for (const p of plan.plans) {
  const notionRows = p.entries.filter((e) => e.notion).length;
  const expected = p.id === 'ot' ? 348 : fromNotion[p.id];   // OT: only the sequenced Torah rows
  if (notionRows !== expected) problems.push(`${p.id}: ${notionRows} Notion-backed entries, expected ${expected}`);
  const seqs = new Set(), days = new Set();
  for (const e of p.entries) {
    if (seqs.has(e.seq)) problems.push(`${p.id}: duplicate seq ${e.seq}`);
    seqs.add(e.seq);
    if (e.day != null) { const k = `${e.day}`; if (days.has(k)) problems.push(`${p.id}: duplicate day ${e.day}`); days.add(k); }
    if (!p.movements.some((m) => m.id === e.movement)) problems.push(`${p.id}: ${e.id} unknown movement ${e.movement}`);
    if (e.type === 'reading' && !e.ref) problems.push(`${p.id}: reading ${e.id} has no ESV query`);
  }
}
if (problems.length) { console.error('FAILED:\n' + problems.join('\n')); process.exit(1); }

mkdirSync(join(here, '..', 'app'), { recursive: true });
writeFileSync(join(here, '..', 'app', 'plan.json'), JSON.stringify(plan));

for (const p of plan.plans) {
  const t = {};
  for (const e of p.entries) t[e.type] = (t[e.type] || 0) + 1;
  const gen = p.entries.filter((e) => e.generated).length;
  console.log(`${p.id.toUpperCase()}  ${p.entries.length} entries  (${Object.entries(t).map(([k, v]) => `${k} ${v}`).join(', ')})  ` +
              `${p.entries.length - gen} from Notion, ${gen} generated  ·  ${p.movements.length} movements  ·  weeks 1–${Math.max(...p.entries.map((e) => e.week || 0))}`);
}
