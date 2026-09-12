/**
 * Narrowkind Immersion — Scripture Worker
 *
 * Port of the response contract from jwilkey/esv-bible-api
 * (github.com/jwilkey/esv-bible-api) onto the live ESV API v3.
 * That project targeted ESV API v2 (`/v2/rest/passageQuery`,
 * `crossway-xml-1.0`), which Crossway has retired. The JSON shape it
 * defined is preserved verbatim:
 *
 *   { passage: { reference, verses: [{ number, text, heading,
 *                                      subheading, footnotes: [{id,text}] }] },
 *     copyright, options }
 *
 * Added on top: `html` (ESV's own markup, sanitised) so poetry and
 * paragraphing survive into the reader — half this plan is Psalms,
 * Prophets and Job, and verse-per-line destroys them.
 *
 * Routes
 *   GET  /passage?q=Romans+1:1-17      → clean JSON (cached)
 *   POST /note                          → optional Notion Notes write-back
 *   GET  /health
 *
 * Secrets:  ESV_API_KEY  (required)
 *           NOTION_TOKEN (optional — only for /note)
 *           APP_KEY      (optional — shared secret gate)
 */

const ESV_ENDPOINT = 'https://api.esv.org/v3/passage/html/';

const ESV_PARAMS = {
  'include-passage-references': 'false',
  'include-verse-numbers': 'true',
  'include-first-verse-numbers': 'true',
  'include-footnotes': 'true',
  'include-footnote-body': 'true',
  'include-headings': 'true',
  'include-short-copyright': 'false',
  'include-copyright': 'false',
  'include-css-link': 'false',
  'inline-styles': 'false',
  'wrapping-div': 'false',
  'div-classes': 'passage',
  'include-book-titles': 'false',
  'include-audio-link': 'false',
  'include-chapter-numbers': 'true',
  'link-url': '',
};

const COPYRIGHT =
  'The Holy Bible, English Standard Version. Copyright © 2001 by Crossway Bibles, ' +
  'a publishing ministry of Good News Publishers. Used by permission. All rights reserved. ' +
  'https://www.esv.org';

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET,POST,OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type,X-App-Key',
};

const json = (body, status = 200, extra = {}) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json; charset=utf-8', ...CORS, ...extra },
  });

// ---------------------------------------------------------------- helpers

const stripTags = (html) =>
  html
    .replace(/<sup class="footnote">.*?<\/sup>/gs, '')
    .replace(/<sup class="crossref">.*?<\/sup>/gs, '')
    .replace(/<[^>]+>/g, '')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/\s+/g, ' ')
    .trim();

/** Pull the trailing footnote block out of the ESV markup. */
function extractFootnotes(html) {
  const m = html.match(/<div class="footnotes">([\s\S]*?)<\/div>/);
  if (!m) return { body: html, notes: [] };
  const notes = [];
  const re = /<p[^>]*>([\s\S]*?)<\/p>/g;
  let n, i = 0;
  while ((n = re.exec(m[1]))) {
    const chunk = n[1];
    const idm = chunk.match(/href="#b(\d+)"/);
    const text = stripTags(chunk.replace(/<span class="footnote">[\s\S]*?<\/span>/, '')).replace(/^\[\d+\]\s*/, '');
    if (!text) continue;
    notes.push({ id: idm ? idm[1] : String(++i), text });
  }
  return { body: html.replace(m[0], ''), notes };
}

/**
 * Split the passage markup into verses. Headings (<h3>) and Psalm
 * ascriptions (<h4>) attach to the verse that follows them, matching the
 * jwilkey contract.
 */
function toVerses(body, allNotes) {
  const marker = /<b class="(?:verse-num|chapter-num)"[^>]*>\s*(?:(\d+):)?(\d+)\s*(?:&nbsp;)?\s*<\/b>/g;
  const heads = [];
  const headRe = /<(h[34])[^>]*>([\s\S]*?)<\/\1>/g;
  let h;
  while ((h = headRe.exec(body))) heads.push({ at: h.index, level: h[1], text: stripTags(h[2]) });

  const hits = [];
  let m;
  while ((m = marker.exec(body))) hits.push({ at: m.index, end: marker.lastIndex, chapter: m[1], number: +m[2] });
  if (!hits.length) return [];

  return hits.map((hit, i) => {
    // Stop at the next verse marker OR the next heading, whichever comes
    // first — otherwise a verse swallows the heading that follows it.
    const nextVerse = i + 1 < hits.length ? hits[i + 1].at : body.length;
    const nextHead = heads.find((x) => x.at >= hit.end && x.at < nextVerse);
    const slice = body.slice(hit.end, nextHead ? nextHead.at : nextVerse);
    const prev = i === 0 ? 0 : hits[i - 1].at;
    const owned = heads.filter((x) => x.at >= prev && x.at < hit.at);
    const noteIds = [...slice.matchAll(/<sup class="footnote">[\s\S]*?>(\d+)<\/a><\/sup>/g)].map((x) => x[1]);
    return {
      number: hit.number,
      chapter: hit.chapter ? +hit.chapter : undefined,
      text: stripTags(slice),
      heading: owned.find((x) => x.level === 'h3')?.text ?? null,
      subheading: owned.find((x) => x.level === 'h4')?.text ?? null,
      footnotes: noteIds
        .map((id) => allNotes.find((n) => n.id === id))
        .filter(Boolean)
        .map((n) => ({ id: n.id, text: n.text })),
    };
  });
}

/** Keep ESV's structural markup; drop anything interactive or external. */
function sanitise(html) {
  return html
    .replace(/<a\b[^>]*>/g, '')
    .replace(/<\/a>/g, '')
    .replace(/\son\w+="[^"]*"/g, '')
    .replace(/<script[\s\S]*?<\/script>/g, '');
}

const normalise = (q) =>
  q.replace(/[‐-―]/g, '-').replace(/\s*-\s*/g, '-').replace(/\s+/g, ' ').trim();

// ---------------------------------------------------------------- routes

async function passage(request, env, ctx) {
  const url = new URL(request.url);
  const raw = url.searchParams.get('q');
  if (!raw) return json({ error: 'Missing ?q= passage reference' }, 400);
  if (!env.ESV_API_KEY) return json({ error: 'Worker is missing ESV_API_KEY' }, 500);

  const q = normalise(raw);
  const cacheKey = new Request(`https://nk.cache/passage?q=${encodeURIComponent(q)}`, { method: 'GET' });
  const cache = caches.default;
  const hit = await cache.match(cacheKey);
  if (hit) return new Response(hit.body, { status: 200, headers: { ...Object.fromEntries(hit.headers), ...CORS, 'X-Cache': 'HIT' } });

  const target = new URL(ESV_ENDPOINT);
  target.searchParams.set('q', q);
  for (const [k, v] of Object.entries(ESV_PARAMS)) target.searchParams.set(k, v);

  const res = await fetch(target.toString(), { headers: { Authorization: `Token ${env.ESV_API_KEY}` } });
  if (!res.ok) {
    const detail = await res.text();
    return json({ error: 'ESV API error', status: res.status, detail: detail.slice(0, 500) }, 502);
  }
  const data = await res.json();
  const markup = (data.passages || []).join('\n').trim();

  // An unresolvable reference comes back as an empty passage list. Fail
  // loudly — never guess, and never let the client render generated text.
  if (!markup) return json({ error: 'Reference not found', query: q, canonical: data.canonical || null }, 404);

  const { body, notes } = extractFootnotes(markup);
  const verses = toVerses(body, notes);

  const payload = {
    passage: { reference: data.canonical || q, verses },
    html: sanitise(body).trim(),
    copyright: COPYRIGHT,
    options: {
      showParagraphMarkings: false,
      showWordsOfChristMarkings: true,
      showFootnotes: true,
      showFormatting: true,
    },
    meta: { query: q, translation: 'ESV', source: 'api.esv.org/v3/passage/html' },
  };

  const out = json(payload, 200, { 'Cache-Control': 'public, max-age=31536000, immutable', 'X-Cache': 'MISS' });
  ctx.waitUntil(cache.put(cacheKey, out.clone()));
  return out;
}

const NOTION_DB = {
  nt: '3318f32d-a7c7-422e-9022-39197dac80da',
  ot: '298574b2-06ec-4ded-9021-678be7f12c63',
};

/**
 * Optional: push one reader note into the Notes field of that day's row
 * in the Notion reading plan. Explicitly invoked by the reader — the
 * journal is never synced in the background.
 */
async function note(request, env) {
  if (!env.NOTION_TOKEN) return json({ error: 'Worker is missing NOTION_TOKEN' }, 501);
  const { plan, day, text, passage: ref } = await request.json().catch(() => ({}));
  const db = NOTION_DB[plan];
  if (!db || typeof day !== 'number' || !text) return json({ error: 'Expected { plan: "nt"|"ot", day: number, text: string }' }, 400);

  const H = {
    Authorization: `Bearer ${env.NOTION_TOKEN}`,
    'Notion-Version': '2022-06-28',
    'Content-Type': 'application/json',
  };

  const q = await fetch(`https://api.notion.com/v1/databases/${db}/query`, {
    method: 'POST',
    headers: H,
    body: JSON.stringify({ filter: { property: 'Day', number: { equals: day } }, page_size: 5 }),
  });
  if (!q.ok) return json({ error: 'Notion query failed', detail: (await q.text()).slice(0, 400) }, 502);
  const rows = (await q.json()).results || [];
  const row = ref ? rows.find((r) => (r.properties?.Passage?.rich_text?.[0]?.plain_text || '') === ref) || rows[0] : rows[0];
  if (!row) return json({ error: `No ${plan.toUpperCase()} row for day ${day}` }, 404);

  const existing = (row.properties?.Notes?.rich_text || []).map((t) => t.plain_text).join('');
  const stamp = new Date().toISOString().slice(0, 10);
  const merged = `${existing ? existing + '\n\n' : ''}[${stamp}] ${text}`.slice(0, 1900);

  const p = await fetch(`https://api.notion.com/v1/pages/${row.id}`, {
    method: 'PATCH',
    headers: H,
    body: JSON.stringify({ properties: { Notes: { rich_text: [{ text: { content: merged } }] } } }),
  });
  if (!p.ok) return json({ error: 'Notion update failed', detail: (await p.text()).slice(0, 400) }, 502);
  return json({ ok: true, page: row.id, day, plan });
}

export default {
  async fetch(request, env, ctx) {
    if (request.method === 'OPTIONS') return new Response(null, { headers: CORS });
    const url = new URL(request.url);

    if (env.APP_KEY && url.pathname !== '/health') {
      const given = request.headers.get('X-App-Key') || url.searchParams.get('k');
      if (given !== env.APP_KEY) return json({ error: 'Unauthorised' }, 401);
    }

    if (url.pathname === '/health') return json({ ok: true, esv: Boolean(env.ESV_API_KEY), notion: Boolean(env.NOTION_TOKEN) });
    if (url.pathname === '/passage' && request.method === 'GET') return passage(request, env, ctx);
    if (url.pathname === '/note' && request.method === 'POST') return note(request, env);
    return json({ error: 'Not found', routes: ['/health', 'GET /passage?q=', 'POST /note'] }, 404);
  },
};
