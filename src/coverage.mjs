/** Which verses of each book a plan actually covers. */
import { loadCorpus } from './usfm.mjs';
import { parseRef, indexer, ABBR } from './refs.mjs';

export function coverage(refs, corpusDir = '/tmp/webusfm') {
  const corpus = loadCorpus(corpusDir);
  const chapters = Object.fromEntries(Object.entries(corpus).map(([k, b]) => [k, b.chapters]));
  const seen = new Map();   // code -> Set(verse index)
  const bad = [];
  for (const ref of refs) {
    const p = parseRef(ref, chapters);
    if (!p || !chapters[p.code]) { bad.push(ref); continue; }
    const idx = indexer(chapters[p.code]);
    const set = seen.get(p.code) || new Set();
    const hi = Math.min(idx.at(p.ec, p.ev), idx.total - 1);
    for (let i = idx.at(p.sc, p.sv); i <= hi; i++) set.add(i);
    seen.set(p.code, set);
  }
  const report = [];
  for (const [code, set] of seen) {
    const idx = indexer(chapters[code]);
    const missing = [];
    let run = null;
    const label = (i) => {
      for (const { chapter, verses } of chapters[code]) {
        if (i < verses) return `${chapter}:${i + 1}`;
        i -= verses;
      }
      return '?';
    };
    for (let i = 0; i < idx.total; i++) {
      if (!set.has(i)) { if (!run) run = [i, i]; else run[1] = i; }
      else if (run) { missing.push(run); run = null; }
    }
    if (run) missing.push(run);
    report.push({
      book: ABBR[code], code, total: idx.total, covered: set.size,
      gaps: missing.map(([a, b]) => (a === b ? label(a) : `${label(a)}-${label(b)}`)),
    });
  }
  return { report: report.sort((a, b) => a.book.localeCompare(b.book)), unparsed: bad };
}
