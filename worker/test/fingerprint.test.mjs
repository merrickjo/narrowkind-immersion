import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parserRegion, version, digest, expected } from './fingerprint.mjs';

test('a parser change is accompanied by a PARSER_VERSION bump', () => {
  const now = { version: version(), digest: digest(parserRegion()) };
  const was = expected();

  if (now.digest === was.digest) {
    assert.equal(now.version, was.version,
      'the parser is unchanged, so PARSER_VERSION should not have moved');
    return;
  }
  assert.ok(now.version > was.version,
    `the parser changed (${was.digest} → ${now.digest}) but PARSER_VERSION is still ${now.version}.\n` +
    '    Passage responses are cached immutably for a year and keyed by that number, so this fix\n' +
    '    would never reach a reader who has already fetched the passage. Bump PARSER_VERSION in\n' +
    '    worker/src/index.js, then run: npm run fingerprint');
  assert.fail('PARSER_VERSION was bumped correctly — now run `npm run fingerprint` to record it');
});
