/**
 * USFM → discourse units.
 *
 * Source: World English Bible (public domain), ebible.org `eng-web_usfm`.
 * WEB carries no editorial section headings, but it does carry the
 * translators' own paragraphing: \p \m \pi \pc \nb for prose, \b for
 * stanza breaks in poetry, \d for Psalm ascriptions, \q1..\q4 for lines.
 *
 * Those paragraph starts are the only boundaries this pipeline is allowed
 * to cut on. Reading units are built by MERGING whole paragraphs — a
 * paragraph is never split — so no reading begins or ends mid-unit.
 * Chapter and verse numbering is identical to the ESV for every book in
 * these plans, so the resulting references resolve against the ESV API.
 */
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

// \d carries Psalm ascriptions and, in Psalm 119, the 22 acrostic letter
// headings — genuine discourse boundaries, so it breaks a unit like \p does.
const PARA = new Set(['p', 'm', 'pi', 'pi1', 'pi2', 'pc', 'nb', 'pm', 'pmo', 'pmc', 'pr', 'cls',
                      'li', 'li1', 'li2', 'ph', 'ph1', 'd', 'ms', 'ms1', 'mr', 'sp']);

export function parseBook(path) {
  const lines = readFileSync(path, 'utf8').split('\n');
  let name = null, ch = 0, v = 0;
  const units = [];          // { sc, sv, ec, ev, verses }
  let open = null;
  const chapterVerses = new Map();

  const close = () => {
    if (open && open.sv) { open.ec = ch; open.ev = v; units.push(open); }
    open = null;
  };

  for (const raw of lines) {
    const line = raw.trim();
    const m = line.match(/^\\([a-z]+[0-9]*)\b/);
    if (!m) continue;
    const tag = m[1];

    if (tag === 'h' && !name) { name = line.slice(2).trim(); continue; }
    if (tag === 'c') { close(); ch = +line.split(/\s+/)[1]; open = { sc: ch, sv: 0, verses: 0 }; continue; }
    if (tag === 'b' || PARA.has(tag)) {
      // A paragraph/stanza break starts a new unit — but only once at
      // least one verse has landed in the current one.
      if (open && open.verses > 0) { close(); open = { sc: ch, sv: 0, verses: 0 }; }
      else if (!open) open = { sc: ch, sv: 0, verses: 0 };
      // fall through: \p and \b lines may still carry a \v
    }
    const vm = line.match(/\\v\s+(\d+)/);
    if (vm) {
      v = +vm[1];
      chapterVerses.set(ch, Math.max(chapterVerses.get(ch) || 0, v));
      if (!open) open = { sc: ch, sv: 0, verses: 0 };
      if (!open.sv) { open.sv = v; open.sc = ch; }
      open.verses++;
    }
  }
  close();

  return {
    name,
    chapters: [...chapterVerses.entries()].sort((a, b) => a[0] - b[0]).map(([c, n]) => ({ chapter: c, verses: n })),
    units: units.filter((u) => u.sv > 0),
  };
}

export function loadCorpus(dir) {
  const out = {};
  for (const f of readdirSync(dir)) {
    if (!f.endsWith('.usfm')) continue;
    const idm = f.match(/^(\d+)-([A-Z0-9]{3})/);
    if (!idm) continue;
    const book = parseBook(join(dir, f));
    if (!book.name || !book.units.length) continue;
    out[idm[2]] = book;
  }
  return out;
}
