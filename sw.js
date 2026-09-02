/* ============================================================
   sw.js — offline cache + achtergrondherinnering
   ============================================================ */

// Wordt automatisch gezet door ./deploy.sh op basis van een hash van de
// app-bestanden. Verander deze regel niet met de hand.
const VERSION    = 'afvalapp-9bdd673af2';
const ASSETS     = `${VERSION}-assets`;
const CONFIG     = 'afvalapp-config';
const CONFIG_URL = '/__afvalapp_config__';
const TAG        = 'afvalapp-weigh-in';

const PRECACHE = [
  './',
  'index.html',
  'css/styles.css',
  'js/app.js',
  'js/store.js',
  'js/charts.js',
  'js/reminders.js',
  'manifest.webmanifest',
  'icons/icon-192.png',
  'icons/icon-512.png',
  'icons/icon-maskable-512.png',
  'icons/apple-touch-icon.png',
];

/* ── Levenscyclus ───────────────────────────────────────────── */

self.addEventListener('install', (event) => {
  event.waitUntil((async () => {
    const cache = await caches.open(ASSETS);
    // 'reload' omzeilt de gewone browsercache, anders installeren we
    // mogelijk oude bestanden. Eén mislukt bestand mag de installatie
    // niet slopen.
    await Promise.all(
      PRECACHE.map((url) => cache.add(new Request(url, { cache: 'reload' })).catch(() => {})),
    );
    // Bewust géén skipWaiting: de nieuwe versie blijft wachten tot de
    // gebruiker in de app op "Vernieuwen" tikt. Zo krijg je nooit nieuwe
    // HTML met oude JavaScript. Bij de allereerste installatie is er
    // niets om op te wachten en activeert hij vanzelf.
  })());
});

self.addEventListener('activate', (event) => {
  event.waitUntil((async () => {
    const keys = await caches.keys();
    await Promise.all(
      keys.filter((k) => k !== ASSETS && k !== CONFIG).map((k) => caches.delete(k)),
    );
    await self.clients.claim();
  })());
});

/* ── Fetch: navigaties netwerk-eerst, rest cache-eerst ──────── */

self.addEventListener('fetch', (event) => {
  const { request } = event;
  if (request.method !== 'GET') return;

  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;

  if (request.mode === 'navigate') {
    event.respondWith((async () => {
      try {
        const fresh = await fetch(request);
        const cache = await caches.open(ASSETS);
        cache.put('index.html', fresh.clone()).catch(() => {});
        return fresh;
      } catch {
        const cache = await caches.open(ASSETS);
        return (await cache.match('index.html')) || (await cache.match('./')) || Response.error();
      }
    })());
    return;
  }

  event.respondWith((async () => {
    const cache = await caches.open(ASSETS);
    const hit = await cache.match(request);
    const network = fetch(request)
      .then((res) => {
        if (res && res.ok) cache.put(request, res.clone()).catch(() => {});
        return res;
      })
      .catch(() => null);
    return hit || (await network) || Response.error();
  })());
});

/* ── Instellingen die de pagina doorgeeft ───────────────────── */

async function readConfig() {
  try {
    const cache = await caches.open(CONFIG);
    const res = await cache.match(CONFIG_URL);
    return res ? await res.json() : null;
  } catch {
    return null;
  }
}

async function writeConfig(patch) {
  try {
    const cache = await caches.open(CONFIG);
    const current = (await readConfig()) || {};
    const next = { ...current, ...patch };
    await cache.put(CONFIG_URL, new Response(JSON.stringify(next), {
      headers: { 'Content-Type': 'application/json' },
    }));
    return next;
  } catch {
    return null;
  }
}

self.addEventListener('message', (event) => {
  const data = event.data;
  if (!data) return;

  // De pagina zegt: neem het nu over. Dit gebeurt alleen nadat de
  // gebruiker op "Vernieuwen" heeft getikt.
  if (data.type === 'skip-waiting') {
    self.skipWaiting();
    return;
  }

  if (data.type === 'config') {
    event.waitUntil(writeConfig({
      reminderEnabled: !!data.reminderEnabled,
      reminderTime: data.reminderTime || '08:00',
      reminderFrequency: data.reminderFrequency === 'weekly' ? 'weekly' : 'daily',
      reminderWeekday: Number.isInteger(data.reminderWeekday) ? data.reminderWeekday : 1,
      lastEntryDate: data.lastEntryDate || null,
    }));
  }
});

/* ── Herinnering ────────────────────────────────────────────── */

function localDateISO(d = new Date()) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

async function maybeRemind() {
  const cfg = await readConfig();
  if (!cfg || !cfg.reminderEnabled) return;

  const today = localDateISO();
  if (cfg.lastEntryDate === today) return;      // vandaag al gewogen
  if (cfg.lastNotified === today) return;       // vandaag al herinnerd

  const now = new Date();

  if (cfg.reminderFrequency === 'weekly') {
    const target = Number.isInteger(cfg.reminderWeekday) ? cfg.reminderWeekday : 1;
    if (now.getDay() !== target) return;        // vandaag is de gekozen dag niet
  }

  const [h, m] = String(cfg.reminderTime || '08:00').split(':').map(Number);
  const due = new Date(now);
  due.setHours(h, m, 0, 0);
  if (now < due) return;                        // tijdstip nog niet geweest

  // Staat de app open? Laat de pagina het dan zelf beoordelen —
  // die kent de echte metingen.
  const clientList = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
  if (clientList.length) {
    for (const client of clientList) client.postMessage({ type: 'reminder-check' });
    return;
  }

  await self.registration.showNotification('Afvalapp', {
    body: 'Tijd om je gewicht in te vullen.',
    tag: TAG,
    renotify: true,
    icon: 'icons/icon-192.png',
    badge: 'icons/icon-192.png',
    lang: 'nl',
    data: { url: './' },
  });
  await writeConfig({ lastNotified: today });
}

self.addEventListener('periodicsync', (event) => {
  if (event.tag === TAG) event.waitUntil(maybeRemind());
});

self.addEventListener('sync', (event) => {
  if (event.tag === TAG) event.waitUntil(maybeRemind());
});

/* ── Klik op de melding: app naar voren ─────────────────────── */

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  event.waitUntil((async () => {
    const target = new URL(event.notification.data?.url || './', self.location.href).href;
    const all = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
    for (const client of all) {
      if ('focus' in client) return client.focus();
    }
    if (self.clients.openWindow) return self.clients.openWindow(target);
  })());
});
