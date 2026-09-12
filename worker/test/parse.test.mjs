import { readFileSync } from 'node:fs';
import assert from 'node:assert/strict';

// Load the Worker's parsing internals by evaluating the module source with
// its exports widened — keeps one copy of the parser, no duplication.
const src = readFileSync(new URL('../src/index.js', import.meta.url), 'utf8')
  .replace('export default {', 'export const handler = {')
  + '\nexport { extractFootnotes, toVerses, stripTags, sanitise, normalise };\n';
const mod = await import('data:text/javascript;base64,' + Buffer.from(src).toString('base64'));

const html = readFileSync(new URL('./fixture.html', import.meta.url), 'utf8');
const { body, notes } = mod.extractFootnotes(html);

assert.equal(notes.length, 2, 'two footnotes extracted');
assert.equal(notes[0].id, '1');
assert.match(notes[0].text, /contextual rendering of the Greek word doulos/);
assert.ok(!body.includes('class="footnotes"'), 'footnote block removed from body');

const verses = mod.toVerses(body, notes);
assert.equal(verses.length, 4, 'three epistle verses plus the psalm line');

assert.equal(verses[0].number, 1);
assert.equal(verses[0].chapter, 1);
assert.equal(verses[0].heading, 'Greeting');
assert.equal(verses[0].text, 'Paul, a servant of Christ Jesus, called to be an apostle, set apart for the gospel of God,');
assert.equal(verses[0].footnotes.length, 1);
assert.match(verses[0].footnotes[0].text, /doulos/);

assert.equal(verses[1].number, 2);
assert.equal(verses[1].heading, null, 'verse 2 inherits no heading');

assert.equal(verses[2].number, 16);
assert.equal(verses[2].heading, 'The Righteous Shall Live by Faith');
assert.equal(verses[2].text, 'For I am not ashamed of the gospel, for it is the power of God for salvation to everyone who believes,');

// Psalm ascription attaches as a subheading, per the jwilkey contract.
const psalmBody = body.slice(body.indexOf('<h4>'));
const psalm = mod.toVerses(psalmBody, []);
assert.equal(psalm[0].subheading, 'A Psalm of David.');
assert.equal(psalm[0].text, 'The Lord is my shepherd; I shall not want.');

// Sanitiser strips anchors but keeps structural markup the reader needs.
const clean = mod.sanitise(body);
assert.ok(!/<a\b/.test(clean), 'anchors removed');
assert.ok(clean.includes('class="woc"'), 'words of Christ preserved');
assert.ok(clean.includes('class="line"'), 'poetry lines preserved');

// Reference normalisation: en-dashes from the Notion plan must become hyphens.
assert.equal(mod.normalise('Galatians 3:26–4:7'), 'Galatians 3:26-4:7');
assert.equal(mod.normalise('Mark  2:23 – 3:6'), 'Mark 2:23-3:6');

console.log('OK  worker parser: all assertions passed');
