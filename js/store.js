/* ============================================================
   store.js — opslag, datumhulp en aggregatie per dag/week/maand/jaar
   Alles staat in localStorage; er is geen server.
   ============================================================ */

const K_ENTRIES  = 'afvalapp.entries.v1';
const K_SETTINGS = 'afvalapp.settings.v1';

export const DEFAULT_SETTINGS = {
  startWeight: null,
  goalWeight: null,
  heightCm: null,
  reminderEnabled: false,
  reminderTime: '08:00',
  reminderFrequency: 'daily',   // 'daily' | 'weekly'
  reminderWeekday: 1,           // 0 = zondag … 6 = zaterdag; alleen bij 'weekly'
  theme: 'system',
  lastReminderDate: null,   // YYYY-MM-DD waarop de melding al getoond is
  installDismissed: false,
};

/* ── localStorage met vangnet (privémodus kan gooien) ───────── */

function readJson(key, fallback) {
  try {
    const raw = localStorage.getItem(key);
    return raw ? JSON.parse(raw) : fallback;
  } catch {
    return fallback;
  }
}

function writeJson(key, value) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
    return true;
  } catch {
    return false;
  }
}

/* ── Datumhulp (altijd lokale tijd, nooit UTC-verschuiving) ─── */

export function toISO(date) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

export function todayISO() {
  return toISO(new Date());
}

/** Parse 'YYYY-MM-DD' naar een lokale Date op 12:00 — zomertijdproof. */
export function fromISO(iso) {
  const [y, m, d] = iso.split('-').map(Number);
  return new Date(y, m - 1, d, 12, 0, 0, 0);
}

export function addDays(iso, n) {
  const d = fromISO(iso);
  d.setDate(d.getDate() + n);
  return toISO(d);
}

export function daysBetween(isoA, isoB) {
  return Math.round((fromISO(isoB) - fromISO(isoA)) / 86400000);
}

export function isoWeekOf(date) {
  const t = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
  const dayNr = t.getUTCDay() || 7;               // maandag = 1 … zondag = 7
  t.setUTCDate(t.getUTCDate() + 4 - dayNr);       // naar de donderdag van die week
  const yearStart = new Date(Date.UTC(t.getUTCFullYear(), 0, 1));
  const week = Math.ceil(((t - yearStart) / 86400000 + 1) / 7);
  return { year: t.getUTCFullYear(), week };
}

/* ── Nederlandse formattering ───────────────────────────────── */

const MONTHS_SHORT = ['jan', 'feb', 'mrt', 'apr', 'mei', 'jun', 'jul', 'aug', 'sep', 'okt', 'nov', 'dec'];
const MONTHS_LONG  = ['januari', 'februari', 'maart', 'april', 'mei', 'juni',
                      'juli', 'augustus', 'september', 'oktober', 'november', 'december'];
const DAYS_SHORT   = ['zo', 'ma', 'di', 'wo', 'do', 'vr', 'za'];
const DAYS_LONG    = ['zondag', 'maandag', 'dinsdag', 'woensdag',
                      'donderdag', 'vrijdag', 'zaterdag'];

export const monthShort  = (i) => MONTHS_SHORT[i];
export const monthLong   = (i) => MONTHS_LONG[i];
export const weekdayLong = (i) => DAYS_LONG[i];

/** 82.4 → "82,4" */
export function fmtKg(v, decimals = 1) {
  if (v === null || v === undefined || Number.isNaN(v)) return '—';
  return v.toFixed(decimals).replace('.', ',');
}

/** -1.2 → "−1,2"  ·  +0.3 → "+0,3"  ·  0 → "0,0" */
export function fmtDelta(v, decimals = 1) {
  if (v === null || v === undefined || Number.isNaN(v)) return '—';
  const rounded = Number(v.toFixed(decimals));
  if (rounded === 0) return `0,${'0'.repeat(decimals)}`;
  const sign = rounded > 0 ? '+' : '−';
  return sign + Math.abs(rounded).toFixed(decimals).replace('.', ',');
}

/** '2026-09-02' → 'wo 2 sep 2026' */
export function fmtDateLong(iso) {
  const d = fromISO(iso);
  return `${DAYS_SHORT[d.getDay()]} ${d.getDate()} ${MONTHS_SHORT[d.getMonth()]} ${d.getFullYear()}`;
}

/** '2026-09-02' → 'wo 2 sep' (jaar alleen als het niet dit jaar is) */
export function fmtDateShort(iso) {
  const d = fromISO(iso);
  const sameYear = d.getFullYear() === new Date().getFullYear();
  return `${DAYS_SHORT[d.getDay()]} ${d.getDate()} ${MONTHS_SHORT[d.getMonth()]}` +
         (sameYear ? '' : ` ${d.getFullYear()}`);
}

/* ── Metingen ───────────────────────────────────────────────── */

/** Interne vorm: { 'YYYY-MM-DD': { kg, note, ts } } — één meting per dag. */
function rawEntries() {
  const obj = readJson(K_ENTRIES, {});
  return (obj && typeof obj === 'object' && !Array.isArray(obj)) ? obj : {};
}

/** Alle metingen, oplopend op datum: [{ date, kg, note, ts }] */
export function listEntries() {
  const raw = rawEntries();
  return Object.keys(raw)
    .filter((k) => /^\d{4}-\d{2}-\d{2}$/.test(k) && typeof raw[k]?.kg === 'number')
    .sort()
    .map((date) => ({ date, kg: raw[date].kg, note: raw[date].note || '', ts: raw[date].ts || 0 }));
}

export function getEntry(date) {
  const raw = rawEntries();
  return raw[date] ? { date, kg: raw[date].kg, note: raw[date].note || '' } : null;
}

export function saveEntry(date, kg, note = '') {
  const raw = rawEntries();
  const isNew = !raw[date];
  raw[date] = { kg: Math.round(kg * 100) / 100, note: note.trim().slice(0, 80), ts: Date.now() };
  const ok = writeJson(K_ENTRIES, raw);
  return { ok, isNew };
}

export function deleteEntry(date) {
  const raw = rawEntries();
  delete raw[date];
  return writeJson(K_ENTRIES, raw);
}

export function replaceAllEntries(map) {
  return writeJson(K_ENTRIES, map);
}

export function wipeAll() {
  try {
    localStorage.removeItem(K_ENTRIES);
    localStorage.removeItem(K_SETTINGS);
    return true;
  } catch {
    return false;
  }
}

/* ── Instellingen ───────────────────────────────────────────── */

export function getSettings() {
  return { ...DEFAULT_SETTINGS, ...readJson(K_SETTINGS, {}) };
}

export function patchSettings(patch) {
  const next = { ...getSettings(), ...patch };
  writeJson(K_SETTINGS, next);
  return next;
}

/* ── Afgeleide cijfers ──────────────────────────────────────── */

/** Verschil met de meting die het dichtst bij `daysAgo` dagen geleden ligt. */
export function changeOver(entries, daysAgo) {
  if (entries.length < 2) return null;
  const last = entries[entries.length - 1];
  const cutoff = addDays(last.date, -daysAgo);
  // laatste meting op of vóór de cutoff, anders de oudste die we hebben
  let ref = null;
  for (const e of entries) {
    if (e.date <= cutoff) ref = e;
    else break;
  }
  if (!ref) ref = entries[0];
  if (ref.date === last.date) return null;
  return { delta: last.kg - ref.kg, from: ref, to: last };
}

export function bmi(kg, heightCm) {
  if (!kg || !heightCm) return null;
  const m = heightCm / 100;
  return kg / (m * m);
}

export function bmiLabel(value) {
  if (value === null) return '';
  if (value < 18.5) return 'ondergewicht';
  if (value < 25)   return 'gezond gewicht';
  if (value < 30)   return 'overgewicht';
  return 'obesitas';
}

/** Voortschrijdend gemiddelde over een venster van `days` kalenderdagen. */
export function movingAverage(entries, days = 7) {
  const out = new Map();
  for (let i = 0; i < entries.length; i++) {
    const end = entries[i].date;
    const start = addDays(end, -(days - 1));
    let sum = 0, n = 0;
    for (let j = i; j >= 0; j--) {
      if (entries[j].date < start) break;
      sum += entries[j].kg;
      n++;
    }
    out.set(end, sum / n);
  }
  return out;
}

/* ── Aggregatie per periode ─────────────────────────────────── */

function bucketize(entries, keyFn, labelFn, subFn) {
  const map = new Map();
  for (const e of entries) {
    const key = keyFn(e);
    if (!map.has(key)) map.set(key, { key, items: [] });
    map.get(key).items.push(e);
  }
  return [...map.values()]
    .sort((a, b) => (a.key < b.key ? -1 : 1))
    .map((b) => {
      const kgs = b.items.map((i) => i.kg);
      const sum = kgs.reduce((a, c) => a + c, 0);
      return {
        key: b.key,
        label: labelFn(b.items[0], b.key),
        sublabel: subFn ? subFn(b.items[0], b.key) : '',
        value: sum / kgs.length,
        min: Math.min(...kgs),
        max: Math.max(...kgs),
        count: kgs.length,
        first: b.items[0],
        last: b.items[b.items.length - 1],
        date: b.items[b.items.length - 1].date,
      };
    });
}

/**
 * Bouwt de reeks voor de grafiek.
 * @returns {{ points: Array, mode: 'time'|'bucket', title: string, subtitle: string }}
 */
export function buildSeries(entries, period) {
  if (entries.length === 0) {
    return { points: [], mode: 'time', title: '', subtitle: '' };
  }

  if (period === 'day') {
    const end = todayISO();
    const start = addDays(end, -29);
    let sel = entries.filter((e) => e.date >= start && e.date <= end);
    let title = 'Laatste 30 dagen';

    if (sel.length < 2) {                      // te weinig recent — toon de laatste metingen
      sel = entries.slice(-30);
      title = sel.length >= 2
        ? `Laatste ${sel.length} metingen`
        : 'Je metingen';
    }

    const points = sel.map((e) => ({
      key: e.date,
      label: fmtDateShort(e.date),
      sublabel: e.note,
      value: e.kg,
      min: e.kg,
      max: e.kg,
      count: 1,
      date: e.date,
    }));

    const subtitle = points.length
      ? `${fmtDateShort(points[0].date)} – ${fmtDateShort(points[points.length - 1].date)}`
      : '';
    return { points, mode: 'time', title, subtitle };
  }

  if (period === 'week') {
    let buckets = bucketize(
      entries,
      (e) => {
        const { year, week } = isoWeekOf(fromISO(e.date));
        return `${year}-W${String(week).padStart(2, '0')}`;
      },
      (_first, key) => `wk ${Number(key.slice(6))}`,
      (first) => {
        const d = fromISO(first.date);
        return `${MONTHS_SHORT[d.getMonth()]} ${d.getFullYear()}`;
      },
    );
    buckets = buckets.slice(-26);
    return {
      points: buckets,
      mode: 'bucket',
      title: buckets.length >= 26 ? 'Laatste 26 weken' : 'Per week',
      subtitle: buckets.length ? `${buckets.length} ${buckets.length === 1 ? 'week' : 'weken'} met metingen` : '',
    };
  }

  if (period === 'month') {
    let buckets = bucketize(
      entries,
      (e) => e.date.slice(0, 7),
      (_first, key) => MONTHS_SHORT[Number(key.slice(5, 7)) - 1],
      (_first, key) => key.slice(0, 4),
    );
    buckets = buckets.slice(-24);
    return {
      points: buckets,
      mode: 'bucket',
      title: buckets.length >= 24 ? 'Laatste 24 maanden' : 'Per maand',
      subtitle: buckets.length ? `${buckets.length} ${buckets.length === 1 ? 'maand' : 'maanden'} met metingen` : '',
    };
  }

  // year
  const buckets = bucketize(entries, (e) => e.date.slice(0, 4), (_f, key) => key);
  return {
    points: buckets,
    mode: 'bucket',
    title: 'Per jaar',
    subtitle: buckets.length ? `${buckets.length} ${buckets.length === 1 ? 'jaar' : 'jaren'} met metingen` : '',
  };
}
