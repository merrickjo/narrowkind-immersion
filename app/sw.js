/**
 * Narrowkind Immersion — offline shell.
 *
 * The reader is meant to live on an e-ink device that is frequently out of
 * range, so the shell and the plan must survive with no network. Scripture
 * responses are immutable once fetched (the Worker caches them for a year),
 * so they are cached here too — stale-while-revalidate would only cost a
 * refresh on a panel that hates repainting.
 *
 * Bump SHELL_V to force a re-download of index.html / plan.json / books.json.
 */
const SHELL_V = 'nk-shell-v7';
const DATA_V  = 'nk-data-v1';
const SHELL = ['./', 'index.html', 'plan.json', 'books.json', 'manifest.json', 'icon.svg'];

self.addEventListener('install', (e) => {
  e.waitUntil((async () => {
    const c = await caches.open(SHELL_V);
    // addAll is all-or-nothing; a single 404 would leave the app with no
    // offline copy at all, so each entry is allowed to fail on its own.
    await Promise.all(SHELL.map((u) => c.add(new Request(u, { cache: 'reload' })).catch(() => {})));
    self.skipWaiting();
  })());
});

self.addEventListener('activate', (e) => {
  e.waitUntil((async () => {
    const keep = new Set([SHELL_V, DATA_V]);
    await Promise.all((await caches.keys()).filter((k) => !keep.has(k)).map((k) => caches.delete(k)));
    await self.clients.claim();
  })());
});

self.addEventListener('fetch', (e) => {
  const req = e.request;
  if (req.method !== 'GET') return;                       // /note posts must always go out
  const url = new URL(req.url);
  if (url.origin !== location.origin) return;             // fonts: let the network decide

  // Scripture: cache-first, because a fetched passage never changes.
  if (url.pathname === '/passage') {
    e.respondWith((async () => {
      const c = await caches.open(DATA_V);
      const hit = await c.match(req);
      if (hit) return hit;
      try {
        const res = await fetch(req);
        if (res.ok) c.put(req, res.clone());
        return res;
      } catch (err) {
        return new Response(JSON.stringify({ error: 'Offline, and this passage is not cached yet.' }),
          { status: 503, headers: { 'Content-Type': 'application/json' } });
      }
    })());
    return;
  }

  if (url.pathname === '/health' || url.pathname === '/note') return;

  // Shell: cache-first with a quiet background refresh.
  e.respondWith((async () => {
    const c = await caches.open(SHELL_V);
    const hit = await c.match(req, { ignoreSearch: true });
    if (hit) {
      e.waitUntil(fetch(req).then((r) => r.ok && c.put(req, r.clone())).catch(() => {}));
      return hit;
    }
    try {
      const res = await fetch(req);
      if (res.ok) c.put(req, res.clone());
      return res;
    } catch (err) {
      return (await c.match('index.html')) || new Response('Offline.', { status: 503 });
    }
  })());
});
