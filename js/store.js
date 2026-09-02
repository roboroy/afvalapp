/* ============================================================
   store.js — opslag, datumhulp en aggregatie per dag/week/maand/jaar
   Alles staat in localStorage; er is geen server.
   ============================================================ */

const K_ENTRIES    = 'afvalapp.entries.v1';
const K_SETTINGS   = 'afvalapp.settings.v1';
const K_MILESTONES = 'afvalapp.milestones.v1';

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
  milestonesBackfilled: false,  // eenmalige inhaalslag over bestaande historie
  setupDeferredOn: null,        // YYYY-MM-DD waarop 'Later' gekozen is
  lastBackupAt: null,           // YYYY-MM-DD van de laatste back-up
  lastBackupCount: 0,           // aantal metingen op dat moment
  backupDeferredUntil: null,    // YYYY-MM-DD tot wanneer niet vragen
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
    localStorage.removeItem(K_MILESTONES);
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

/* ── Trend, tempo en prognose ───────────────────────────────── */

/**
 * Het trendgewicht: het 7-daags gemiddelde op de laatste meting.
 * Je dagelijkse gewicht schommelt met vocht en voeding; deze lijn laat
 * zien wat er werkelijk gebeurt.
 */
export function trendWeight(entries, days = 7) {
  if (!entries.length) return null;
  const avg = movingAverage(entries, days);
  return avg.get(entries[entries.length - 1].date) ?? null;
}

/** Het trendgewicht zoals het `daysAgo` dagen geleden was. */
export function trendAgo(entries, daysAgo, days = 7) {
  if (entries.length < 2) return null;
  const cutoff = addDays(entries[entries.length - 1].date, -daysAgo);
  let ref = null;
  for (const e of entries) {
    if (e.date <= cutoff) ref = e;
    else break;
  }
  if (!ref) return null;
  const avg = movingAverage(entries, days);
  return avg.get(ref.date) ?? null;
}

/** Is er genoeg gemeten om van een trend te mogen spreken? */
export function hasTrend(entries) {
  return entries.length >= 3 &&
         daysBetween(entries[0].date, entries[entries.length - 1].date) >= 2;
}

/**
 * Tempo in kilo per week, via een rechte lijn door de trendwaarden van de
 * afgelopen `windowDays` dagen. Negatief betekent afvallen.
 * Geeft null als er te weinig of te kort gemeten is om iets te beweren.
 */
export function weeklyRate(entries, windowDays = 28) {
  if (entries.length < 5) return null;

  const last = entries[entries.length - 1].date;

  // De eerste zes dagen van je hele reeks hebben nog geen volledig 7-daags
  // gemiddelde achter zich. Die punten trekken de lijn kunstmatig vlak, dus
  // die laten we buiten de berekening — tenzij er dan te weinig overblijft.
  const opgewarmd = addDays(entries[0].date, 6);
  const venster = addDays(last, -(windowDays - 1));

  let sel = entries.filter((e) => e.date >= venster && e.date >= opgewarmd);
  if (sel.length < 5 || daysBetween(sel[0].date, sel[sel.length - 1].date) < 14) {
    sel = entries.filter((e) => e.date >= venster);
  }

  if (sel.length < 5) return null;
  if (daysBetween(sel[0].date, sel[sel.length - 1].date) < 14) return null;

  const avg = movingAverage(entries, 7);
  const pts = sel
    .map((e) => ({ x: daysBetween(sel[0].date, e.date), y: avg.get(e.date) }))
    .filter((pt) => typeof pt.y === 'number');
  if (pts.length < 5) return null;

  const n = pts.length;
  const sx  = pts.reduce((a, pt) => a + pt.x, 0);
  const sy  = pts.reduce((a, pt) => a + pt.y, 0);
  const sxx = pts.reduce((a, pt) => a + pt.x * pt.x, 0);
  const sxy = pts.reduce((a, pt) => a + pt.x * pt.y, 0);

  const noemer = n * sxx - sx * sx;
  if (noemer === 0) return null;

  return ((n * sxy - sx * sy) / noemer) * 7;   // kg per dag → kg per week
}

/**
 * Wanneer haal je je streefgewicht bij het huidige tempo?
 * @returns {{status: string, rate: number|null, eta: string|null, weeks: number|null}}
 *   status: 'ok' | 'te-weinig-data' | 'doel-gehaald' | 'geen-daling' | 'te-ver-weg'
 */
export function forecast(entries, goal) {
  const leeg = { status: 'te-weinig-data', rate: null, eta: null, weeks: null };
  if (goal === null || goal === undefined || !entries.length) return leeg;

  const huidig = trendWeight(entries);
  if (huidig === null) return leeg;

  if (huidig - goal <= 0) {
    return { status: 'doel-gehaald', rate: weeklyRate(entries), eta: null, weeks: null };
  }

  const rate = weeklyRate(entries);
  if (rate === null) return leeg;

  // Minder dan 50 gram per week is binnen de ruis; daar valt niets op te
  // baseren zonder een misleidend precieze datum te suggereren.
  if (rate >= -0.05) return { status: 'geen-daling', rate, eta: null, weeks: null };

  const weeks = (huidig - goal) / -rate;
  if (weeks > 260) return { status: 'te-ver-weg', rate, eta: null, weeks };

  return { status: 'ok', rate, weeks, eta: addDays(todayISO(), Math.round(weeks * 7)) };
}

/* ── Weegritme ──────────────────────────────────────────────── */

/**
 * Hoeveel dagen (of weken) op rij is er gemeten, tot en met nu.
 * De reeks breekt niet omdat je vandaag nog niet op de weegschaal stond —
 * de dag is immers nog bezig.
 */
export function currentStreak(entries, frequency = 'daily') {
  const unit = frequency === 'weekly' ? 'week' : 'dag';
  if (!entries.length) return { count: 0, unit };

  if (frequency === 'weekly') {
    const key = (iso) => {
      const { year, week } = isoWeekOf(fromISO(iso));
      return `${year}-W${String(week).padStart(2, '0')}`;
    };
    const weken = new Set(entries.map((e) => key(e.date)));

    let cursor = todayISO();
    if (!weken.has(key(cursor))) {
      cursor = addDays(cursor, -7);                 // deze week nog niet, vorige telt nog
      if (!weken.has(key(cursor))) return { count: 0, unit };
    }
    let count = 0;
    while (weken.has(key(cursor))) {
      count++;
      cursor = addDays(cursor, -7);
    }
    return { count, unit };
  }

  const dagen = new Set(entries.map((e) => e.date));
  let cursor = todayISO();
  if (!dagen.has(cursor)) {
    cursor = addDays(cursor, -1);                   // vandaag mag nog
    if (!dagen.has(cursor)) return { count: 0, unit };
  }
  let count = 0;
  while (dagen.has(cursor)) {
    count++;
    cursor = addDays(cursor, -1);
  }
  return { count, unit };
}

/* ── Back-up ────────────────────────────────────────────────── */

/**
 * Hoe ver staat de back-up achter? Je metingen staan alleen op dit apparaat,
 * dus dit is het enige scenario waarin je echt alles kwijt kunt raken.
 *
 * @returns {{nodig, nieuwe, dagen, laatst, totaal}}
 */
export function backupStatus(entries, settings) {
  const totaal = entries.length;
  const nieuwe = Math.max(0, totaal - (settings.lastBackupCount || 0));
  const laatst = settings.lastBackupAt || null;
  const dagen = laatst ? daysBetween(laatst, todayISO()) : null;

  let nodig = false;
  if (totaal >= 5) {
    // Nooit eerder een back-up: eerder vragen, want dan is het risico grootst.
    if (laatst === null && totaal >= 20) nodig = true;
    // Genoeg nieuw werk om te verliezen.
    else if (nieuwe >= 25) nodig = true;
    // Of gewoon lang geleden — vangt de wekelijkse wegers op, die anders
    // pas na een half jaar aan 25 metingen komen.
    else if (dagen !== null && dagen >= 120 && nieuwe >= 1) nodig = true;
  }

  return { nodig, nieuwe, dagen, laatst, totaal };
}

/* ── Mijlpalen ──────────────────────────────────────────────── */

/**
 * Behaalde mijlpalen: { id: { date, titel, tekst } }.
 * Eenmaal behaald blijft behaald — zak je later terug, dan pakt de app een
 * mijlpaal niet af en viert hem ook niet nog eens.
 */
export function getMilestones() {
  const obj = readJson(K_MILESTONES, {});
  return (obj && typeof obj === 'object' && !Array.isArray(obj)) ? obj : {};
}

export function replaceMilestones(map) {
  return writeJson(K_MILESTONES, map);
}

const STREAK_DREMPELS = { dag: [7, 30, 100], week: [4, 12, 26] };

/* Eén plek voor de teksten, zodat het vieren en het inhalen niet uiteenlopen. */
const TEKST = {
  goal: (grens, start, goal) => grens === 100
    ? { titel: 'Streefgewicht bereikt', tekst: `Je zit op ${fmtKg(goal)} kg. Dat was het doel.` }
    : { titel: `${grens}% van de weg`,
        tekst: `Je bent ${grens}% onderweg van ${fmtKg(start)} naar ${fmtKg(goal)} kg.` },
  bmi30: () => ({ titel: 'Uit de obesitas-categorie',
                  tekst: 'Je BMI is onder de 30. Dat is een echte gezondheidswinst.' }),
  bmi25: () => ({ titel: 'Gezond gewicht',
                  tekst: 'Je BMI is onder de 25 — dat geldt als een gezond gewicht.' }),
  streak: (grens, unit) => {
    const eenheid = unit === 'week' ? 'weken' : 'dagen';
    return { titel: `${grens} ${eenheid} op rij`,
             tekst: `Je hebt je ${grens} ${eenheid} achter elkaar gewogen. Dat volhouden is het halve werk.` };
  },
};

/**
 * Welke mijlpalen zijn er op dít moment gehaald, gegeven de stand van zaken?
 * Rekent met het trendgewicht: op de rauwe meting zou één droge ochtend al
 * een feestje opleveren dat de dag erna weer onterecht blijkt.
 */
function bereikteMijlpalen(entries, settings, peil, reeks) {
  const uit = [];
  const start = settings.startWeight ?? (entries.length ? entries[0].kg : null);
  const goal = settings.goalWeight;

  if (peil !== null && start !== null && goal !== null && goal !== undefined && start > goal) {
    const pct = ((start - peil) / (start - goal)) * 100;
    for (const grens of [25, 50, 75, 100]) {
      if (pct >= grens) uit.push({ id: `goal-${grens}`, ...TEKST.goal(grens, start, goal) });
    }
  }

  // Alleen vieren als je de grens ook echt overschrijdt. Wie al gezond
  // begon, heeft geen BMI-mijlpaal gehaald.
  if (peil !== null && start !== null && settings.heightCm) {
    const nu = bmi(peil, settings.heightCm);
    const toen = bmi(start, settings.heightCm);
    if (toen >= 30 && nu < 30) uit.push({ id: 'bmi-overgewicht', ...TEKST.bmi30() });
    if (toen >= 25 && nu < 25) uit.push({ id: 'bmi-gezond', ...TEKST.bmi25() });
  }

  if (reeks) {
    for (const grens of STREAK_DREMPELS[reeks.unit] ?? []) {
      if (reeks.count >= grens) {
        uit.push({ id: `streak-${reeks.unit}-${grens}`, ...TEKST.streak(grens, reeks.unit) });
      }
    }
  }

  return uit;
}

/**
 * Controleert bij het opslaan of er iets nieuws bereikt is.
 * @returns {Array<{id, titel, tekst}>} alleen wat nú nieuw is
 */
export function checkMilestones(entries, settings) {
  if (!entries.length) return [];

  const behaald = getMilestones();
  const peil = hasTrend(entries) ? trendWeight(entries) : null;
  const reeks = currentStreak(entries, settings.reminderFrequency);
  const vandaag = todayISO();

  const nieuw = [];
  for (const m of bereikteMijlpalen(entries, settings, peil, reeks)) {
    if (behaald[m.id]) continue;
    behaald[m.id] = { date: vandaag, titel: m.titel, tekst: m.tekst };
    nieuw.push(m);
  }

  if (nieuw.length) writeJson(K_MILESTONES, behaald);
  return nieuw;
}

/** De dag waarop elke reeks-drempel voor het eerst gehaald werd. */
function reeksDatums(entries, frequency) {
  const uit = {};
  const drempels = STREAK_DREMPELS[frequency === 'weekly' ? 'week' : 'dag'];

  if (frequency === 'weekly') {
    const sleutel = (isoDatum) => {
      const { year, week } = isoWeekOf(fromISO(isoDatum));
      return `${year}-W${String(week).padStart(2, '0')}`;
    };
    let run = 0, vorige = null;
    const gezien = new Set();
    for (const e of entries) {
      const k = sleutel(e.date);
      if (gezien.has(k)) continue;
      gezien.add(k);
      run = (vorige !== null && sleutel(addDays(e.date, -7)) === vorige) ? run + 1 : 1;
      vorige = k;
      for (const g of drempels) if (run >= g && !uit[g]) uit[g] = e.date;
    }
  } else {
    let run = 0, vorige = null;
    for (const e of entries) {
      run = (vorige !== null && addDays(vorige, 1) === e.date) ? run + 1 : 1;
      vorige = e.date;
      for (const g of drempels) if (run >= g && !uit[g]) uit[g] = e.date;
    }
  }
  return uit;
}

/**
 * Eenmalige inhaalslag over je bestaande historie. Legt mijlpalen vast op de
 * dag waarop je ze werkelijk haalde, zonder ze te vieren — je hebt ze immers
 * niet vandaag bereikt.
 * @returns {number} hoeveel mijlpalen er zijn vastgelegd
 */
export function backfillMilestones(entries, settings) {
  const behaald = getMilestones();
  if (!entries.length) return 0;

  const avg = movingAverage(entries, 7);
  const eersteDatum = entries[0].date;
  const reeks = currentStreak(entries, settings.reminderFrequency);
  const datums = reeksDatums(entries, settings.reminderFrequency);

  let aantal = 0;
  const leg = (id, date, titel, tekst) => {
    if (behaald[id]) return;
    behaald[id] = { date, titel, tekst };
    aantal++;
  };

  for (let i = 0; i < entries.length; i++) {
    // Zelfde drempel als hasTrend(): pas vanaf drie metingen over twee dagen.
    if (i < 2 || daysBetween(eersteDatum, entries[i].date) < 2) continue;
    const peil = avg.get(entries[i].date);
    if (typeof peil !== 'number') continue;

    for (const m of bereikteMijlpalen(entries, settings, peil, null)) {
      leg(m.id, entries[i].date, m.titel, m.tekst);
    }
  }

  for (const grens of STREAK_DREMPELS[reeks.unit] ?? []) {
    if (!datums[grens]) continue;
    const t = TEKST.streak(grens, reeks.unit);
    leg(`streak-${reeks.unit}-${grens}`, datums[grens], t.titel, t.tekst);
  }

  if (aantal) writeJson(K_MILESTONES, behaald);
  return aantal;
}

/** Alle behaalde mijlpalen, nieuwste eerst. */
export function listMilestones() {
  return Object.entries(getMilestones())
    .map(([id, m]) => ({ id, ...m }))
    .sort((a, b) => (a.date === b.date ? 0 : a.date < b.date ? 1 : -1));
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
