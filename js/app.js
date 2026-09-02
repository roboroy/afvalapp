/* ============================================================
   app.js — alles aan elkaar knopen: navigatie, invoer, grafiek,
   historie en instellingen.
   ============================================================ */

import {
  listEntries, getEntry, saveEntry, deleteEntry, replaceAllEntries, wipeAll,
  getSettings, patchSettings,
  todayISO, addDays, fromISO, monthLong,
  fmtKg, fmtDelta, fmtDateLong, fmtDateShort,
  changeOver, movingAverage, buildSeries, bmi, bmiLabel,
} from './store.js';

import { renderChart } from './charts.js';

import {
  notificationsSupported, permissionState, requestPermission,
  showReminder, applyReminder, isDue, alreadyNudgedToday, buildIcs,
} from './reminders.js';

const APP_VERSION = 'v1.0';

const $ = (id) => document.getElementById(id);

let settings = getSettings();
let period = 'day';

/* ── Kleine helpers ─────────────────────────────────────────── */

/** Accepteert zowel "82,4" als "82.4"; geeft null bij onzin. */
function parseNum(str) {
  if (typeof str !== 'string') str = String(str ?? '');
  const cleaned = str.trim().replace(',', '.');
  if (cleaned === '') return null;
  const n = Number(cleaned);
  return Number.isFinite(n) ? n : null;
}

let toastTimer;
function toast(message) {
  const el = $('toast');
  el.textContent = message;
  el.classList.add('is-on');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => el.classList.remove('is-on'), 2600);
}

function download(filename, text, mime) {
  const blob = new Blob([text], { type: `${mime};charset=utf-8` });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.append(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
}

function setDeltaClass(el, delta) {
  el.classList.remove('is-down', 'is-up');
  if (delta === null || delta === undefined || Number.isNaN(delta)) return;
  const r = Number(delta.toFixed(1));
  if (r < 0) el.classList.add('is-down');
  else if (r > 0) el.classList.add('is-up');
}

/* ── Thema ──────────────────────────────────────────────────── */

const THEME_ORDER = ['system', 'light', 'dark'];
const THEME_NAME  = { system: 'systeem', light: 'licht', dark: 'donker' };

function applyTheme(theme) {
  if (theme === 'system') document.documentElement.removeAttribute('data-theme');
  else document.documentElement.setAttribute('data-theme', theme);
}

$('themeToggle').addEventListener('click', () => {
  const next = THEME_ORDER[(THEME_ORDER.indexOf(settings.theme) + 1) % THEME_ORDER.length];
  settings = patchSettings({ theme: next });
  applyTheme(next);
  toast(`Thema: ${THEME_NAME[next]}`);
});

/* ── Navigatie ──────────────────────────────────────────────── */

const VIEWS = ['today', 'chart', 'history', 'settings'];

function showView(name) {
  for (const v of VIEWS) $(`view-${v}`).hidden = v !== name;
  for (const tab of document.querySelectorAll('.tab')) {
    const active = tab.dataset.view === name;
    tab.classList.toggle('is-active', active);
    if (active) tab.setAttribute('aria-current', 'page');
    else tab.removeAttribute('aria-current');
  }
  if (name === 'chart') renderChartView();
  if (name === 'history') renderHistory();
  window.scrollTo({ top: 0 });
}

for (const tab of document.querySelectorAll('.tab')) {
  tab.addEventListener('click', () => showView(tab.dataset.view));
}

/* ── Vandaag ────────────────────────────────────────────────── */

function renderToday() {
  const entries = listEntries();
  const last = entries[entries.length - 1] || null;

  /* hero */
  $('heroWeight').textContent = last ? fmtKg(last.kg) : '—';
  const deltaEl = $('heroDelta');
  if (entries.length >= 2) {
    const prev = entries[entries.length - 2];
    const d = last.kg - prev.kg;
    deltaEl.textContent = `${fmtDelta(d)} kg sinds ${fmtDateShort(prev.date)}`;
    setDeltaClass(deltaEl, d);
  } else {
    deltaEl.textContent = '';
    setDeltaClass(deltaEl, null);
  }
  $('heroDate').textContent = last
    ? `Laatste meting: ${fmtDateLong(last.date)}`
    : 'Nog geen meting — vul hieronder je gewicht in.';

  /* doel */
  const goalCard = $('goalCard');
  const goal = settings.goalWeight;
  const start = settings.startWeight ?? (entries.length ? entries[0].kg : null);
  if (goal !== null && start !== null && last) {
    goalCard.hidden = false;
    const total = start - goal;
    const done = start - last.kg;
    const pct = total === 0 ? 100 : Math.max(0, Math.min(100, (done / total) * 100));
    $('goalFill').style.width = `${pct}%`;
    $('goalBar').setAttribute('aria-valuenow', Math.round(pct));
    $('goalStart').textContent = `${fmtKg(start)} kg`;
    $('goalTarget').textContent = `${fmtKg(goal)} kg`;
    $('goalPct').textContent = `${Math.round(pct)}%`;
    const left = last.kg - goal;
    $('goalRemaining').textContent = left <= 0
      ? 'Doel gehaald! 🎉'
      : `nog ${fmtKg(left)} kg te gaan`;
  } else {
    goalCard.hidden = true;
  }

  /* statistieken */
  const week  = changeOver(entries, 7);
  const month = changeOver(entries, 30);
  const wEl = $('statWeek');
  wEl.textContent = week ? `${fmtDelta(week.delta)} kg` : '—';
  setDeltaClass(wEl, week?.delta ?? null);

  const mEl = $('statMonth');
  mEl.textContent = month ? `${fmtDelta(month.delta)} kg` : '—';
  setDeltaClass(mEl, month?.delta ?? null);

  const tEl = $('statTotal');
  if (last && start !== null) {
    const d = last.kg - start;
    tEl.textContent = `${fmtDelta(d)} kg`;
    setDeltaClass(tEl, d);
  } else {
    tEl.textContent = '—';
    setDeltaClass(tEl, null);
  }

  $('statCount').textContent = String(entries.length);

  /* hint bij het formulier */
  syncFormHint();
}

/* ── Invoerformulier ────────────────────────────────────────── */

function syncFormHint() {
  const date = $('entryDate').value;
  const existing = date ? getEntry(date) : null;
  const hint = $('entryHint');
  if (existing) {
    hint.textContent = `Er staat al ${fmtKg(existing.kg)} kg op ${fmtDateShort(date)}. Opslaan overschrijft die meting.`;
    $('saveBtn').textContent = 'Bijwerken';
  } else {
    hint.textContent = '';
    $('saveBtn').textContent = 'Opslaan';
  }
}

function loadDateIntoForm(date) {
  $('entryDate').value = date;
  const existing = getEntry(date);
  $('entryWeight').value = existing ? fmtKg(existing.kg) : '';
  $('entryNote').value = existing ? existing.note : '';
  syncFormHint();
}

$('entryDate').addEventListener('change', () => {
  loadDateIntoForm($('entryDate').value || todayISO());
});

for (const btn of document.querySelectorAll('.stepper__btn')) {
  btn.addEventListener('click', () => {
    const input = $('entryWeight');
    const entries = listEntries();
    const base = parseNum(input.value)
      ?? (entries.length ? entries[entries.length - 1].kg : 80);
    const next = Math.max(20, Math.min(400, base + Number(btn.dataset.step)));
    input.value = fmtKg(next);
  });
}

$('entryForm').addEventListener('submit', (e) => {
  e.preventDefault();
  const date = $('entryDate').value || todayISO();
  const kg = parseNum($('entryWeight').value);

  if (kg === null || kg < 20 || kg > 400) {
    toast('Vul een gewicht in tussen 20 en 400 kg.');
    $('entryWeight').focus();
    return;
  }
  if (date > todayISO()) {
    toast('Je kunt geen datum in de toekomst kiezen.');
    return;
  }

  const { ok, isNew } = saveEntry(date, kg, $('entryNote').value);
  if (!ok) {
    toast('Opslaan mislukt — is de opslag van je browser vol?');
    return;
  }

  // Eerste meting? Gebruik die meteen als startgewicht.
  if (settings.startWeight === null && listEntries().length === 1) {
    settings = patchSettings({ startWeight: kg });
    $('setStart').value = fmtKg(kg);
  }

  toast(isNew ? `${fmtKg(kg)} kg opgeslagen` : `${fmtDateShort(date)} bijgewerkt naar ${fmtKg(kg)} kg`);
  $('entryNote').value = '';
  syncFormHint();
  renderToday();
  refreshReminderState();
});

/* ── Grafiek ────────────────────────────────────────────────── */

for (const btn of document.querySelectorAll('.segmented__btn')) {
  btn.addEventListener('click', () => {
    period = btn.dataset.period;
    for (const b of document.querySelectorAll('.segmented__btn')) {
      const active = b === btn;
      b.classList.toggle('is-active', active);
      b.setAttribute('aria-selected', String(active));
    }
    renderChartView();
  });
}

function renderChartView() {
  const entries = listEntries();
  const series = buildSeries(entries, period);
  const host = $('chartHost');
  const empty = $('chartEmpty');
  const legend = $('chartLegend');

  $('chartTitle').textContent = series.title || 'Grafiek';
  $('chartSub').textContent = series.subtitle;

  if (!series.points.length) {
    host.replaceChildren();
    empty.hidden = false;
    legend.hidden = true;
    $('chartTrend').textContent = '';
    $('chartMin').textContent = $('chartAvg').textContent = $('chartMax').textContent = '—';
    return;
  }

  empty.hidden = true;
  legend.hidden = !(period === 'day' && series.points.length > 2);

  renderChart(host, {
    points: series.points,
    mode: series.mode,
    goal: settings.goalWeight,
    avgMap: period === 'day' ? movingAverage(entries, 7) : null,
  });

  /* trend over de getoonde periode */
  const trendEl = $('chartTrend');
  if (series.points.length >= 2) {
    const d = series.points[series.points.length - 1].value - series.points[0].value;
    trendEl.textContent = `${fmtDelta(d)} kg`;
    setDeltaClass(trendEl, d);
  } else {
    trendEl.textContent = '';
    setDeltaClass(trendEl, null);
  }

  /* laagste / gemiddeld / hoogste over de getoonde punten */
  const lows  = series.points.map((p) => p.min);
  const highs = series.points.map((p) => p.max);
  const avg   = series.points.reduce((a, p) => a + p.value, 0) / series.points.length;
  $('chartMin').textContent = `${fmtKg(Math.min(...lows))}`;
  $('chartAvg').textContent = `${fmtKg(avg)}`;
  $('chartMax').textContent = `${fmtKg(Math.max(...highs))}`;
}

/* ── Historie ───────────────────────────────────────────────── */

function renderHistory() {
  const entries = listEntries().slice().reverse();   // nieuwste bovenaan
  const list = $('historyList');
  list.replaceChildren();
  $('historyEmpty').hidden = entries.length > 0;

  let currentMonth = null;

  entries.forEach((e, idx) => {
    const monthKey = e.date.slice(0, 7);
    if (monthKey !== currentMonth) {
      currentMonth = monthKey;
      const d = fromISO(e.date);
      const head = document.createElement('li');
      head.className = 'hmonth';
      head.textContent = `${monthLong(d.getMonth())} ${d.getFullYear()}`;
      list.append(head);
    }

    const older = entries[idx + 1];               // de meting ervóór in de tijd
    const delta = older ? e.kg - older.kg : null;

    const li = document.createElement('li');
    li.className = 'hitem';

    const main = document.createElement('div');
    main.className = 'hitem__main';
    const dateEl = document.createElement('div');
    dateEl.className = 'hitem__date';
    dateEl.textContent = fmtDateLong(e.date);
    main.append(dateEl);
    if (e.note) {
      const note = document.createElement('div');
      note.className = 'hitem__note';
      note.textContent = e.note;
      main.append(note);
    }

    const kg = document.createElement('div');
    kg.className = 'hitem__kg';
    kg.textContent = fmtKg(e.kg);

    const dl = document.createElement('div');
    dl.className = 'hitem__delta';
    dl.textContent = delta === null ? '' : fmtDelta(delta);
    setDeltaClass(dl, delta);

    const del = document.createElement('button');
    del.type = 'button';
    del.className = 'hitem__del';
    del.setAttribute('aria-label', `Meting van ${fmtDateLong(e.date)} verwijderen`);
    del.textContent = '✕';
    del.addEventListener('click', (ev) => {
      ev.stopPropagation();
      if (!confirm(`Meting van ${fmtDateLong(e.date)} verwijderen?`)) return;
      deleteEntry(e.date);
      toast('Meting verwijderd');
      renderHistory();
      renderToday();
    });

    li.append(main, kg, dl, del);
    li.addEventListener('click', () => {
      loadDateIntoForm(e.date);
      showView('today');
      $('entryWeight').focus();
    });

    list.append(li);
  });
}

/* ── Instellingen ───────────────────────────────────────────── */

function renderBmi() {
  const entries = listEntries();
  const last = entries[entries.length - 1];
  const out = $('bmiOut');
  const value = last && settings.heightCm ? bmi(last.kg, settings.heightCm) : null;
  out.textContent = value === null
    ? 'Vul je lengte in om je BMI te zien.'
    : `BMI: ${fmtKg(value)} — ${bmiLabel(value)} (bij ${fmtKg(last.kg)} kg).`;
}

function bindNumberSetting(inputId, key, { integer = false, min, max } = {}) {
  const input = $(inputId);
  input.addEventListener('change', () => {
    const raw = input.value.trim();
    if (raw === '') {
      settings = patchSettings({ [key]: null });
      input.value = '';
    } else {
      let n = parseNum(raw);
      if (n === null || n < min || n > max) {
        toast(`Vul een waarde in tussen ${min} en ${max}.`);
        input.value = settings[key] === null ? '' : (integer ? String(settings[key]) : fmtKg(settings[key]));
        return;
      }
      if (integer) n = Math.round(n);
      settings = patchSettings({ [key]: n });
      input.value = integer ? String(n) : fmtKg(n);
    }
    renderToday();
    renderBmi();
    if (!$('view-chart').hidden) renderChartView();
  });
}

bindNumberSetting('setStart',  'startWeight', { min: 20,  max: 400 });
bindNumberSetting('setGoal',   'goalWeight',  { min: 20,  max: 400 });
bindNumberSetting('setHeight', 'heightCm',    { min: 100, max: 250, integer: true });

/* herinnering */

async function refreshReminderState() {
  const status = $('notifStatus');
  $('reminderTimeField').hidden = !settings.reminderEnabled;

  if (!notificationsSupported()) {
    status.textContent = 'Meldingen worden niet ondersteund in deze browser. De agenda-afspraak werkt wel.';
    return;
  }
  if (!settings.reminderEnabled) {
    status.textContent = 'Herinnering staat uit.';
    return;
  }

  const perm = permissionState();
  if (perm === 'denied') {
    status.textContent = 'Meldingen zijn geblokkeerd. Zet ze aan bij de site-instellingen van je browser, of gebruik de agenda-afspraak.';
    return;
  }
  if (perm !== 'granted') {
    status.textContent = 'Meldingen zijn nog niet toegestaan.';
    return;
  }

  const entries = listEntries();
  const lastEntryDate = entries.length ? entries[entries.length - 1].date : null;
  const { background } = await applyReminder({ ...settings, lastEntryDate }, onReminderFires);

  const standalone = window.matchMedia('(display-mode: standalone)').matches;
  if (background === 'on') {
    status.textContent = `Elke dag om ${settings.reminderTime} krijg je een melding, ook als de app dicht is.`;
  } else if (!standalone) {
    status.textContent = `Ingesteld op ${settings.reminderTime}. Zet de app op je beginscherm — pas dan mag Android je wekken terwijl de app dicht is. Tot die tijd zie je de herinnering zodra je de app opent.`;
  } else {
    status.textContent = `Ingesteld op ${settings.reminderTime}. Android bepaalt zelf wanneer het achtergrondproces mag draaien, dus de melding kan iets later komen. De agenda-afspraak is de zekerste back-up.`;
  }
}

async function onReminderFires() {
  const entries = listEntries();
  const hasToday = entries.some((e) => e.date === todayISO());
  if (hasToday) return;
  await showReminder('Tijd om je gewicht in te vullen.');
  settings = patchSettings({ lastReminderDate: todayISO() });
}

$('setReminder').addEventListener('change', async (e) => {
  const on = e.target.checked;

  if (on && notificationsSupported() && permissionState() === 'default') {
    const result = await requestPermission();
    if (result !== 'granted') {
      toast('Zonder toestemming kan de app je niet waarschuwen. De agenda-afspraak werkt wel.');
    }
  }

  settings = patchSettings({ reminderEnabled: on });
  await refreshReminderState();
  if (on && permissionState() === 'granted') toast(`Herinnering aan om ${settings.reminderTime}`);
});

$('setReminderTime').addEventListener('change', async (e) => {
  const value = e.target.value || '08:00';
  settings = patchSettings({ reminderTime: value });
  await refreshReminderState();
  toast(`Herinnering om ${value}`);
});

$('testNotifBtn').addEventListener('click', async () => {
  if (!notificationsSupported()) { toast('Meldingen worden niet ondersteund.'); return; }
  if (permissionState() === 'default') await requestPermission();
  if (permissionState() !== 'granted') { toast('Meldingen zijn niet toegestaan.'); return; }
  const ok = await showReminder('Zo ziet je dagelijkse herinnering eruit.');
  toast(ok ? 'Melding verstuurd' : 'Melding kon niet worden getoond');
});

$('icsBtn').addEventListener('click', () => {
  download('afvalapp-herinnering.ics', buildIcs(settings.reminderTime || '08:00'), 'text/calendar');
  toast('Open het bestand om het in je agenda te zetten');
});

/* gegevens */

$('exportJsonBtn').addEventListener('click', () => {
  const payload = {
    app: 'afvalapp',
    version: 1,
    exportedAt: new Date().toISOString(),
    settings: { ...settings, lastReminderDate: null },
    entries: listEntries().map(({ date, kg, note }) => ({ date, kg, note })),
  };
  download(`afvalapp-backup-${todayISO()}.json`, JSON.stringify(payload, null, 2), 'application/json');
  toast('Back-up gedownload');
});

$('exportCsvBtn').addEventListener('click', () => {
  const rows = [['datum', 'gewicht_kg', 'notitie']];
  for (const e of listEntries()) rows.push([e.date, String(e.kg).replace('.', ','), e.note]);
  const csv = rows
    .map((r) => r.map((c) => (/[";\n]/.test(c) ? `"${c.replace(/"/g, '""')}"` : c)).join(';'))
    .join('\r\n');
  download(`afvalapp-${todayISO()}.csv`, csv, 'text/csv');
  toast('CSV gedownload');
});

$('importBtn').addEventListener('click', () => $('importFile').click());

$('importFile').addEventListener('change', async (e) => {
  const file = e.target.files?.[0];
  e.target.value = '';
  if (!file) return;

  try {
    const data = JSON.parse(await file.text());
    if (!Array.isArray(data.entries)) throw new Error('geen metingen gevonden');

    const map = {};
    for (const row of data.entries) {
      if (!/^\d{4}-\d{2}-\d{2}$/.test(row.date)) continue;
      const kg = typeof row.kg === 'number' ? row.kg : parseNum(row.kg);
      if (kg === null || kg < 20 || kg > 400) continue;
      map[row.date] = { kg, note: String(row.note || '').slice(0, 80), ts: Date.now() };
    }

    const count = Object.keys(map).length;
    if (!count) { toast('Geen bruikbare metingen in dit bestand.'); return; }
    if (!confirm(`${count} metingen gevonden. Dit vervangt je huidige metingen. Doorgaan?`)) return;

    replaceAllEntries(map);
    if (data.settings && typeof data.settings === 'object') {
      const { startWeight, goalWeight, heightCm, reminderTime } = data.settings;
      settings = patchSettings({
        startWeight: typeof startWeight === 'number' ? startWeight : settings.startWeight,
        goalWeight:  typeof goalWeight  === 'number' ? goalWeight  : settings.goalWeight,
        heightCm:    typeof heightCm    === 'number' ? heightCm    : settings.heightCm,
        reminderTime: /^\d{2}:\d{2}$/.test(reminderTime || '') ? reminderTime : settings.reminderTime,
      });
    }
    fillSettingsForm();
    renderToday();
    renderBmi();
    toast(`${count} metingen teruggezet`);
  } catch (err) {
    toast(`Bestand kon niet gelezen worden (${err.message}).`);
  }
});

$('wipeBtn').addEventListener('click', () => {
  if (!confirm('Alles wissen? Al je metingen en instellingen verdwijnen van dit apparaat. Dit kan niet ongedaan gemaakt worden.')) return;
  wipeAll();
  settings = getSettings();
  applyTheme(settings.theme);
  fillSettingsForm();
  loadDateIntoForm(todayISO());
  renderToday();
  renderBmi();
  renderChartView();
  renderHistory();
  toast('Alle gegevens gewist');
});

function fillSettingsForm() {
  $('setStart').value  = settings.startWeight === null ? '' : fmtKg(settings.startWeight);
  $('setGoal').value   = settings.goalWeight  === null ? '' : fmtKg(settings.goalWeight);
  $('setHeight').value = settings.heightCm    === null ? '' : String(settings.heightCm);
  $('setReminder').checked = !!settings.reminderEnabled;
  $('setReminderTime').value = settings.reminderTime || '08:00';
  $('reminderTimeField').hidden = !settings.reminderEnabled;
}

/* ── Zetje wanneer je nog niet gewogen hebt ─────────────────── */

async function nudgeIfDue() {
  settings = getSettings();
  const entries = listEntries();
  const hasToday = entries.some((e) => e.date === todayISO());

  if (!isDue(settings, hasToday)) return;

  if (!alreadyNudgedToday(settings)) {
    await showReminder('Je hebt jezelf vandaag nog niet gewogen.');
    settings = patchSettings({ lastReminderDate: todayISO() });
  }
  toast('Je hebt jezelf vandaag nog niet gewogen.');
}

/* ── Installeren op het beginscherm ─────────────────────────── */

let deferredInstall = null;

window.addEventListener('beforeinstallprompt', (e) => {
  e.preventDefault();
  deferredInstall = e;
  if (!settings.installDismissed) $('installBanner').hidden = false;
});

$('installBtn').addEventListener('click', async () => {
  $('installBanner').hidden = true;
  if (!deferredInstall) return;
  deferredInstall.prompt();
  const { outcome } = await deferredInstall.userChoice;
  deferredInstall = null;
  if (outcome === 'accepted') toast('Afvalapp staat nu op je beginscherm');
});

$('installClose').addEventListener('click', () => {
  $('installBanner').hidden = true;
  settings = patchSettings({ installDismissed: true });
});

window.addEventListener('appinstalled', () => {
  $('installBanner').hidden = true;
  refreshReminderState();
});

/* ── Service worker ─────────────────────────────────────────── */

if ('serviceWorker' in navigator) {
  window.addEventListener('load', async () => {
    try {
      await navigator.serviceWorker.register('sw.js');
      await refreshReminderState();
    } catch { /* offline-modus is dan gewoon niet beschikbaar */ }
  });

  navigator.serviceWorker.addEventListener('message', (e) => {
    if (e.data?.type === 'reminder-check') onReminderFires();
  });
}

/* ── Start ──────────────────────────────────────────────────── */

document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'visible') {
    settings = getSettings();
    renderToday();
    if (!$('view-chart').hidden) renderChartView();
    nudgeIfDue();
  }
});

window.addEventListener('resize', () => {
  if (!$('view-chart').hidden) renderChartView();
});

function boot() {
  applyTheme(settings.theme);
  $('appVersion').textContent = APP_VERSION;

  $('entryDate').max = todayISO();
  $('entryDate').min = addDays(todayISO(), -3650);
  loadDateIntoForm(todayISO());

  fillSettingsForm();
  renderToday();
  renderBmi();
  showView('today');
  nudgeIfDue();
}

boot();
