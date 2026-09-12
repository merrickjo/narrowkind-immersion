/**
 * Generates the sequenced OT plan (Triads 2-6) and the two NT completions.
 *
 * Method
 *  1. Reading units come from WEB USFM paragraph/stanza structure — whole
 *     paragraphs only, never split. Validated against the existing NT plan:
 *     95% of Merrick's own NT boundaries land exactly on one of these.
 *  2. Unit merging targets the NT plan's measured load (median 15 verses).
 *  3. Braid runs ACROSS triads, not within: every week carries a narrative
 *     strand, a prophetic strand, and a poetry/wisdom strand, allocated by
 *     largest remainder so all three finish together.
 *  4. Day numbers continue the existing 8-day cycle (6 readings, 2 rest).
 *
 * `day` is the key into the Notion rows. Entries generated here carry
 * `notion: false` — there is no row to write back to until one is created.
 * `seq` is the app's reading order and is always present.
 */
import { loadCorpus } from './usfm.mjs';
import { segment } from './segment.mjs';
import { toRef, ABBR } from './refs.mjs';

const CORPUS_DIR = process.env.WEB_USFM || '/tmp/webusfm';

/** Over-request the last reading of a book so ESV's own versification wins. */
const TAIL_PAD = 10;
function padTail(code, g, chapters) {
  const base = toRef(code, g.sc, g.sv, g.ec, g.ev, chapters);
  if (!base.includes(':')) return base;                       // whole-chapter form already reaches the end
  const name = ABBR[code];
  return `${name} ${g.sc}:${g.sv}-${g.ec}:${g.ev + TAIL_PAD}`;
}

const STRANDS = [
  { key: 'narrative', title: 'Narrative',
    books: [
      ['JOS', 2], ['JDG', 2], ['RUT', 2], ['1SA', 2], ['2SA', 2], ['1KI', 2], ['2KI', 2], ['1CH', 2], ['2CH', 2],
      ['EZR', 3], ['NEH', 3], ['EST', 3], ['LAM', 3], ['DAN', 3],
    ] },
  { key: 'prophets', title: 'Prophets',
    books: [
      ['ISA', 4], ['JER', 4], ['EZK', 4], ['HOS', 4], ['JOL', 4], ['AMO', 4], ['OBA', 4], ['JON', 4],
      ['MIC', 4], ['NAM', 4], ['HAB', 4], ['ZEP', 4], ['HAG', 4], ['ZEC', 4], ['MAL', 4],
    ] },
  { key: 'poetry', title: 'Poetry & Wisdom',
    books: [['PSA', 5], ['JOB', 6], ['PRO', 6], ['ECC', 6], ['SNG', 6]] },
];

export function buildStrands(corpus) {
  const chapters = Object.fromEntries(Object.entries(corpus).map(([k, b]) => [k, b.chapters]));
  return STRANDS.map((s) => {
    const items = [];
    for (const [code, triad] of s.books) {
      const segs = segment(corpus[code].units);
      segs.forEach((g, i) => {
        const terminal = i === segs.length - 1;
        items.push({
          kind: 'reading', code, triad, strand: s.key,
          passage: toRef(code, g.sc, g.sv, g.ec, g.ev, chapters),
          // WEB and ESV disagree on a few books' final verse counts (the
          // Romans doxology, 3 John). A terminal reading over-requests by a
          // margin and lets the ESV API clamp to its own canonical range,
          // so no verse is silently dropped at a book's end.
          ref: terminal ? padTail(code, g, chapters) : null,
          book: ABBR[code], verses: g.verses, terminal,
        });
      });
      // A finished book gets its own review slot, exactly as the NT plan does.
      items.push({ kind: 'review', code, triad, strand: s.key, passage: `${ABBR[code]} Review`, book: ABBR[code] });
    }
    return { ...s, items };
  });
}

/** Largest-remainder allocation so every strand finishes in the same week. */
function weave(strands) {
  const total = strands.reduce((n, s) => n + s.items.length, 0);
  const weeks = Math.ceil(total / 6);
  const cursor = strands.map(() => 0);
  const carry = strands.map(() => 0);
  const rate = strands.map((s) => (s.items.length / total) * 6);
  const out = [];

  for (let w = 0; w < weeks; w++) {
    const want = rate.map((r, i) => {
      const x = r + carry[i];
      return { i, whole: Math.floor(x), frac: x - Math.floor(x) };
    });
    let slots = want.reduce((n, x) => n + x.whole, 0);
    want.sort((a, b) => b.frac - a.frac);
    for (const x of want) { if (slots >= 6) break; x.whole++; slots++; }
    want.sort((a, b) => a.i - b.i);
    for (const x of want) carry[x.i] = rate[x.i] + carry[x.i] - x.whole;

    const week = [];
    for (const x of want) {
      const s = strands[x.i];
      for (let k = 0; k < x.whole && cursor[x.i] < s.items.length; k++) week.push(s.items[cursor[x.i]++]);
    }
    if (week.length) out.push(week);
  }
  // anything left over (rounding tail) appended in strand order
  for (let i = 0; i < strands.length; i++) {
    while (cursor[i] < strands[i].items.length) {
      if (!out.length || out[out.length - 1].length >= 6) out.push([]);
      out[out.length - 1].push(strands[i].items[cursor[i]++]);
    }
  }
  return out;
}

/** Continue the plan's 8-day cycle: 6 reading days, 2 rest. */
const dayFor = (weekIndex, slot) => 8 * weekIndex + 1 + slot;

export function buildOtTail({ startWeek = 59, startSeq = 1 } = {}) {
  const corpus = loadCorpus(CORPUS_DIR);
  const strands = buildStrands(corpus);
  const weeks = weave(strands);

  const entries = [];
  let seq = startSeq;
  const triadDone = new Map();
  for (const [code, triad] of STRANDS.flatMap((s) => s.books)) triadDone.set(triad, (triadDone.get(triad) || 0) + 1);
  const triadRemaining = new Map(triadDone);

  // Flatten, then assign week/day purely by position so every week holds
  // exactly six entries on the plan's 8-day cycle (6 reading days, 2 rest).
  const stream = [];
  for (const week of weeks) {
    for (const item of week) {
      stream.push(item);
      if (item.kind === 'review') {
        const left = triadRemaining.get(item.triad) - 1;
        triadRemaining.set(item.triad, left);
        if (left === 0) stream.push({ kind: 'review', scope: 'movement', triad: item.triad, passage: `Triad ${item.triad} Review`, book: null });
      }
    }
  }

  stream.forEach((item, i) => {
    const wi = Math.floor(i / 6);
    entries.push({
      seq: seq++, day: dayFor(startWeek - 1 + wi, i % 6), week: startWeek + wi,
      movement: item.triad, type: item.kind, passage: item.passage,
      ref: item.ref ?? null, book: item.book, strand: item.strand ?? null,
      ...(item.scope ? { scope: item.scope } : {}),
      ...(item.verses ? { verses: item.verses } : {}),
      generated: true, notion: false,
    });
  });

  return entries;
}

/** The two completions the coverage check found missing from the NT plan. */
export function buildNtCompletions() {
  const corpus = loadCorpus(CORPUS_DIR);
  const chapters = Object.fromEntries(Object.entries(corpus).map(([k, b]) => [k, b.chapters]));
  const from = (code, ch, v) => {
    const units = corpus[code].units.filter((u) => u.sc > ch || (u.sc === ch && u.sv >= v));
    return segment(units).map((g) => ({
      passage: toRef(code, g.sc, g.sv, g.ec, g.ev, chapters), book: ABBR[code], verses: g.verses, seg: g,
    }));
  };
  const tail = (list, code) => {
    if (list.length) list[list.length - 1].ref = padTail(code, list[list.length - 1].seg, chapters);
    return list;
  };
  return {
    romans: tail(from('ROM', 15, 1), 'ROM'),
    revelation: tail(from('REV', 16, 12), 'REV'),
  };
}
