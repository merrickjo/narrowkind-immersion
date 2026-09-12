# Narrowkind Immersion

A whole-Bible reader built on the Narrowkind reading plans, where the unit of
reading is a **passage inside a movement**, not a day inside a countdown.
Scripture is fetched, never generated.

**Live:** <https://narrowkind-scripture.merrickjo.workers.dev> — the reader and
the Scripture proxy are one deployment on one origin, installable as a PWA and
readable offline.
**Source:** <https://github.com/merrickjo/narrowkind-immersion>

```
app/      the reader — index.html + plan.json + books.json + PWA shell
worker/   Cloudflare Worker — ESV API v3 → clean JSON, serves app/, Notion write-back
src/      the plan generator (USFM parsing, segmentation, verification)
data/     plan extracts from Notion + the build entry point
tools/    artifact-copy.mjs — derives the Artifact-preview variant from app/
```

## The plans

| | entries | from Notion | generated | movements | weeks |
|---|---|---|---|---|---|
| New Testament | 532 | 519 | 13 | 7 | 86 |
| Old Testament | 1,567 | 348 | 1,219 | 6 | 261 |

Coverage: **66/66 books, 31,087 of 31,103 verses (99.95%)**, no overlaps.

### What was already there
The NT plan was complete in Notion — 519 day-sequenced entries across seven
movements, three book-strands braided in parallel, two readings per strand per
week. The OT plan had one finished movement (Triad 1: Covenant — the whole
Torah, 348 entries, days 1–462) and five scaffolded ones: 92 chapter blocks
with no day, week, or passage-level segmentation.

### What was generated
OT Triads 2–6 — Joshua through Malachi, Psalms, and the Wisdom books — 1,169
readings plus 39 book and movement reviews.

**Method.** Reading units are whole paragraphs and stanzas taken from the
World English Bible's USFM structure (`\p`, `\m`, `\b`, `\d`, public domain,
ebible.org). A paragraph is never split; units are only ever *merged*, to a
target calibrated against the NT plan's own measured load — median 15 verses,
p25 11, p75 19.

That choice was validated rather than assumed: **95% of the boundaries in the
existing NT plan land exactly on one of these paragraph starts** (98% within
one verse). The discourse atoms are the same ones the NT plan already uses, so
a generated boundary can differ from the one Merrick would have chosen, but it
cannot fall somewhere the text does not break.

Psalm 119 segments on its 22 acrostic stanzas. Whole psalms are never split.

**Braid.** Unlike the Torah (sequential), Triads 2–6 braid *across* movements:
every week carries a narrative strand, a prophetic strand, and a poetry/wisdom
strand, allocated by largest remainder so all three finish in the same week.
203 weeks of exactly six readings, on the plan's existing 8-day cycle
(6 reading days, 2 rest).

### Gaps found and closed
The coverage check ran the existing plans against full book texts:

- **Revelation 16:12–22:21** was absent — two-thirds of the book, including the
  New Jerusalem. Closed with 9 readings.
- **Romans 15–16** was absent; the plan ended at 14:23. Closed with 4 readings.
- **Genesis 22:20–24** fell between two adjacent Torah readings. Closed with 1.

Left alone deliberately: **Mark 16:9–20** (longer ending) and **John 7:53**,
which falls outside the plan's John 7:45-52 / 8:1-11 boundary.

### `seq` vs `day`
`seq` is the reader's order and is always present. `day` is the key into the
Notion row. As of 12 Sep 2026 every entry in both plans has a Notion row behind
it: the generated OT entries were written into the OT database, and the three
spliced completions use fractional days (`100.1`, `203.1`, `46.1`) so that every
pre-existing Day number — and any progress recorded against it — is untouched.

The 92 original OT chapter-block rows are now superseded by passage-level
entries. They are the only rows left with an empty `Day`, so filtering
`Day is empty` in Notion selects exactly those 92 for deletion.

## The reader — built for E Ink

`app/index.html` is the whole app. It targets a B&W E Ink Carta panel (Bigme
HiBreak Pro) first and a normal screen second, and the constraints are not
cosmetic:

- **Two inks.** Pure `#000` on pure `#FFF`, nothing between. A mid grey dithers
  on Carta and reads as smudge, so hierarchy is carried by size, weight, caps
  and rules instead of by colour. Invert is a manual toggle — e-ink has no
  backlight, so `prefers-color-scheme` means nothing here.
- **Pagination, never scrolling.** The reader is a fixed three-row frame that
  never scrolls: scrolling smears every pixel on an e-ink refresh. Text is laid
  into screen-width columns and translated one page at a time, with tap zones
  on the left and right thirds, arrow/space keys, and a page counter. Column
  pitch is exactly one stage width — `width: W`, side padding `p`,
  `column-width: W − 2p`, `column-gap: 2p` — or the next column bleeds in at the
  right edge.
- **No animation, transition or opacity fade anywhere.** All three leave
  ghosting. A global `transition:none !important` enforces it.
- **Type chosen for the panel.** Scripture sets in **Literata** (built for
  long-form screen reading, sturdy stems at low DPI); every piece of apparatus
  sets in **Atkinson Hyperlegible** (designed by the Braille Institute for
  character disambiguation). Scripture and apparatus never share a face, so
  nothing you write can be mistaken for the text.
- **Square corners, 1px ink rules, ≥44px hit targets**, and text labels rather
  than icons.
- **Poetry set as poetry.** ESV marks each poetic line both as a block and with
  a trailing `<br>`; left alone that double-spaces every psalm and doubles the
  page count on a panel that turns slowly. The redundant break is suppressed,
  stanzas get a half-line rule of space, and every line carries a hanging
  indent so a wrap can never be mistaken for a new line.

Reader controls live behind the page counter: font size, leading, invert, and a
**clear ghosting** flash that resets the panel. Turning to a reading prefetches
the next one, so a page turn rarely waits on the network; up to 220 passages are
held on the device.

**Offline.** `app/sw.js` caches the shell and both plan files on first visit and
caches every passage it fetches — a fetched passage never changes. Opened from
the live URL the app installs to the home screen (`manifest.json`, monochrome
`icon.svg`) and then reads with no connection at all, which is the normal state
of a reading device. Bump `SHELL_V` in `sw.js` to force the shell to re-download.

### Two flows

- **Plan** — plan → movement → reading. Position is a bookmark, never a score.
  A Review day shows the readings it covers plus every note left in that stretch.
- **Read** — all 66 books by section, then chapters, for reading outside the plan.

Notes are per-reading in `localStorage`, exportable as Markdown, and a plan note
can be pushed to its Notion row on demand (`POST /note`). Served from its own
Worker the app needs no configuration — the Scripture proxy is the page's own
origin. Only a copy opened from elsewhere (the Artifact preview, a `file://`
copy) needs a Worker address typed into Setup. The ESV key never reaches the
browser in either case.

## Worker

Port of the response contract from
[jwilkey/esv-bible-api](https://github.com/jwilkey/esv-bible-api) onto the live
ESV API. That project targeted ESV API **v2** (`/v2/rest/passageQuery`,
`crossway-xml-1.0`), which Crossway has retired; the JSON shape it defined is
preserved verbatim on top of **v3**:

```json
{ "passage": { "reference": "...",
               "verses": [{ "number": 1, "text": "...", "heading": null,
                            "subheading": null, "footnotes": [] }] },
  "copyright": "...", "options": {} }
```

Added: `html` — ESV's own markup, sanitised — so poetry and paragraphing
survive into the reader. Half this plan is Psalms, Prophets and Job;
verse-per-line destroys them.

```
GET  /                          the reader (static assets from app/)
GET  /passage?q=Romans+1:1-17   clean JSON, cached at the edge for a year
POST /note                      { plan, day, text } → appends to that row's Notes in Notion
GET  /health                    { ok, esv, notion }
```

Assets win for any path that exists in `app/`; everything else falls through to
the Worker script. Because passage responses are immutable for a year, the edge
cache key carries `PARSER_VERSION` — **bump it with any change to `toVerses` or
`extractFootnotes`**, or a parser fix will be invisible behind entries the old
parser cut. That is not hypothetical: the first deploy of this Worker shipped a
stale parser that collapsed Psalm 23 to a single verse, and the fixed deploy
kept serving the broken response from cache until the key changed.

### Deploy
```bash
cd worker
npm install
printf '%s' "$ESV_API_KEY"  | npx wrangler secret put ESV_API_KEY     # required
printf '%s' "$NOTION_TOKEN" | npx wrangler secret put NOTION_TOKEN    # optional, for /note
printf '%s' "$APP_KEY"      | npx wrangler secret put APP_KEY         # optional, gates the Worker
npm test                                                              # parser regression
npx wrangler deploy                                                   # uploads app/ with it
```

Deployed as `narrowkind-scripture` on account `Merrickjo87@gmail.com's Account`.
`ESV_API_KEY` is set; `NOTION_TOKEN` and `APP_KEY` are not — `/note` returns a
clear error until the Notion token is added, and the Worker is currently open to
anyone who knows the URL. Set `APP_KEY` if that stops being acceptable; the app
sends it as `X-App-Key` when one is saved in Setup.

Secrets live only in Cloudflare. Nothing in this repo holds a key, and
`wrangler.toml` documents the three `secret put` lines as comments only.

Terminal readings over-request by ten verses (`Romans 16:17-16:35`) and let the
ESV API clamp to its own canonical range — WEB and ESV disagree on where the
Romans doxology sits, and a book must never lose its last verses to a
versification mismatch. The reader displays ESV's returned `canonical`.

## Rebuilding the plan
```bash
curl -sSL -o web.zip https://ebible.org/Scriptures/eng-web_usfm.zip
unzip -q web.zip -d /tmp/webusfm
node data/build-plan.mjs     # → app/plan.json
node src/verify.mjs          # whole-Bible coverage gate
node --test worker/test/*.mjs
node tools/artifact-copy.mjs # → build/artifact, for the Artifact preview
```

`verify.mjs` fails the build on unparseable references, duplicate `seq` or
`day`, unknown movements, readings with no ESV query, and any coverage gap not
on the known-omissions list.

## Verification log

- Plan: 66/66 books, 31,087 / 31,103 verses, no duplicate `seq` or `day`.
- Segmentation: 95% of the existing NT plan's boundaries fall exactly on a
  generated paragraph start, 98% within one verse.
- Notion: every OT book's row count checked against `plan.json` individually,
  not just on totals. All 39 match.
- Worker, live: a stratified sample of 49 readings drawn across both plans
  (every 42nd) returned with **zero errors and the exact verse count
  `plan.json` expects for all 49**. Poetry, prose, prophets, cross-chapter
  ranges, single-chapter books and Psalm 119's acrostic were each checked by
  hand.
- Reader, headless at 824×1200 (panel) and 390×844 (phone): pagination pitch
  equals one stage width at both sizes, no horizontal overflow, arrow-key page
  turns translate by exactly one stage.
