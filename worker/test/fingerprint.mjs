/**
 * Passage responses are cached at the edge for a year and keyed by
 * PARSER_VERSION, so a parser fix that does not change the key is invisible:
 * the fixed Worker keeps serving responses the old parser cut. That already
 * happened once — the first deploy shipped a stale parser that collapsed
 * Psalm 23 to a single verse, and the fixed deploy changed nothing until the
 * key moved.
 *
 * So the parser region is fingerprinted. Change extractFootnotes or toVerses
 * and this fails until PARSER_VERSION is bumped and the fingerprint rewritten:
 *
 *   npm run fingerprint
 */
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';

export const SRC = new URL('../src/index.js', import.meta.url);
export const FP  = new URL('./parser.fingerprint', import.meta.url);

/** The parser proper: everything from extractFootnotes to the end of toVerses. */
export function parserRegion(src = readFileSync(SRC, 'utf8')) {
  const from = src.indexOf('function extractFootnotes');
  const to   = src.indexOf('/** Keep ESV');
  if (from < 0 || to < 0 || to <= from)
    throw new Error('fingerprint: cannot locate the parser region in worker/src/index.js — ' +
                    'update the markers in worker/test/fingerprint.mjs if the file was restructured');
  return src.slice(from, to);
}

export function version(src = readFileSync(SRC, 'utf8')) {
  const m = /const PARSER_VERSION = (\d+);/.exec(src);
  if (!m) throw new Error('fingerprint: PARSER_VERSION is missing from worker/src/index.js');
  return +m[1];
}

export const digest = (region) => createHash('sha256').update(region).digest('hex').slice(0, 16);

export const expected = () => {
  const [v, d] = readFileSync(FP, 'utf8').trim().split(/\s+/);
  return { version: +v, digest: d };
};
