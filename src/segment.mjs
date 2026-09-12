/**
 * Discourse-unit segmenter.
 *
 * Builds reading units by MERGING whole USFM paragraphs. A paragraph is
 * never split, so no reading starts or ends mid-unit. Targets calibrated
 * against the measured NT plan: median 15 verses, p25 11, p75 19.
 */
const DEFAULTS = { target: 15, min: 8, max: 25, hardMax: 34, chapterBonus: 4 };

export function segment(units, opts = {}) {
  const o = { ...DEFAULTS, ...opts };
  const out = [];
  let cur = null;

  const flush = () => { if (cur) out.push(cur); cur = null; };

  for (const u of units) {
    if (!cur) { cur = { sc: u.sc, sv: u.sv, ec: u.ec, ev: u.ev, verses: u.verses, parts: 1 }; continue; }

    const merged = cur.verses + u.verses;
    // A paragraph that is itself oversized stands alone rather than
    // dragging a neighbour past the ceiling.
    if (u.verses > o.max) { flush(); cur = { sc: u.sc, sv: u.sv, ec: u.ec, ev: u.ev, verses: u.verses, parts: 1 }; continue; }
    if (merged > o.hardMax) { flush(); cur = { sc: u.sc, sv: u.sv, ec: u.ec, ev: u.ev, verses: u.verses, parts: 1 }; continue; }

    // Stop when merging would carry the reading further from the target
    // than closing here does — fill-to-ceiling produces 25-verse slabs and
    // loses the single-sitting weight the NT plan actually has.
    const crossesChapter = u.sc !== cur.ec;
    const keepCost = Math.abs(merged - o.target);
    const stopCost = Math.abs(cur.verses - o.target) - (crossesChapter ? o.chapterBonus : 0);
    const closeNow = cur.verses >= o.min && (merged > o.max || stopCost <= keepCost);

    if (closeNow) { flush(); cur = { sc: u.sc, sv: u.sv, ec: u.ec, ev: u.ev, verses: u.verses, parts: 1 }; }
    else { cur.ec = u.ec; cur.ev = u.ev; cur.verses = merged; cur.parts++; }
  }
  flush();

  // A short tail merges back into its predecessor rather than standing as
  // a stub reading, unless doing so would blow the ceiling.
  if (out.length > 1) {
    const tail = out[out.length - 1], prev = out[out.length - 2];
    if (tail.verses < o.min && tail.verses + prev.verses <= o.hardMax) {
      prev.ec = tail.ec; prev.ev = tail.ev; prev.verses += tail.verses; prev.parts += tail.parts;
      out.pop();
    }
  }
  return out;
}
