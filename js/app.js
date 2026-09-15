/* ============================================================
   app.js — alles aan elkaar knopen: navigatie, invoer, grafiek,
   historie en instellingen.
   ============================================================ */

import {
  listEntries, getEntry, saveEntry, deleteEntry, replaceAllEntries, wipeAll,
  getSettings, patchSettings,
  todayISO, addDays, fromISO, monthLong, weekdayLong,
  fmtNum, fmtDelta, fmtDateLong, fmtDateShort,
  fmtWeight, fmtLength, fmtWeightDelta, fmtLengthDelta,
  toStoredWeight, toStoredLength, toDisplayWeight, toDisplayLength,
  rangeFor, fmtHeight, heightBound, parseHeightInput, LIMITS,
  changeOver, movingAverage, buildSeries, bmi, bmiLabel,
  trendWeight, trendAgo, hasTrend, forecast, currentStreak, waistSamenvatting,
  resetFormatCache,
  checkMilestones, listMilestones, getMilestones, replaceMilestones, backfillMilestones,
  milestoneText,
  backupStatus,
} from './store.js';

import {
  t, setLanguage, language, onLanguageChange, missingKeys,
  setUnits, units, onUnitsChange, unitWeight, unitLength,
} from './i18n.js';

import { renderChart } from './charts.js';

import {
  kanDelen, tekenKaart, deelTekst, canvasNaarBestand, kanBestandDelen,
} from './share.js';

import {
  meldOpening, meldInstallatie, counterConfigured, haalCijfers,
} from './telemetry.js';

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

/* ── Taal ───────────────────────────────────────────────────── */

/**
 * Vult elk element met een data-i18n-attribuut. Zo staat de vertaling niet
 * dubbel in de HTML en hoeft er bij een taalwissel niets herbouwd te worden.
 */
function applyStaticTranslations(root = document) {
  for (const el of root.querySelectorAll('[data-i18n]')) {
    el.textContent = t(el.dataset.i18n);
  }
  for (const el of root.querySelectorAll('[data-i18n-placeholder]')) {
    el.placeholder = t(el.dataset.i18nPlaceholder);
  }
  for (const el of root.querySelectorAll('[data-i18n-aria-label]')) {
    el.setAttribute('aria-label', t(el.dataset.i18nAriaLabel));
  }
  for (const el of root.querySelectorAll('[data-i18n-title]')) {
    el.setAttribute('title', t(el.dataset.i18nTitle));
  }

  // Het invoerveld toont de decimaalscheiding van de taal: 0,0 of 0.0
  $('entryWeight').placeholder = fmtNum(0);
  vulEenheden();

  // Teksten die niet in één sleutel passen omdat er iets in ingevuld moet.
  document.title = t('app.title');
  $('installText').textContent = opIOS() && !staatOpBeginscherm()
    ? t('ios.install', { app: t('app.name') })
    : t('install.prompt', { app: t('app.name') });
  $('versionLine').textContent = t('version.line', { app: t('app.name'), version: APP_VERSION });
  $('updateText').textContent = t('update.ready', { app: t('app.name') });
  vulWeekdagen();
}

/* Voorbeelden voor de lege velden. Per stelsel apart, want een omgerekend
   voorbeeld levert "e.g. 209.4" op — een getal dat niemand als voorbeeld
   zou kiezen. Alleen de lengte komt uit één waarde: 180 cm is precies 5'11".*/
const VOORBEELD = {
  metric:   { start: 95,  goal: 80,  waist: 94.5 },
  imperial: { start: 210, goal: 175, waist: 37 },
};
const VOORBEELD_LENGTE_CM = 180;

/**
 * De eenheden op het scherm: labels naast de grote getallen en voorbeelden
 * in de lege velden. Staat los van applyStaticTranslations omdat een wissel
 * van eenheid niets aan de taal verandert.
 */
function vulEenheden() {
  $('heroUnit').textContent = unitWeight();
  $('waistUnit').textContent = unitLength();

  const eg = (n) => t('eg.value', { n: fmtNum(n) });
  const voorbeeld = VOORBEELD[units()] || VOORBEELD.metric;
  $('entryWaist').placeholder = eg(voorbeeld.waist);
  $('setStart').placeholder   = eg(voorbeeld.start);
  $('setGoal').placeholder    = eg(voorbeeld.goal);
  $('setupGoal').placeholder  = eg(voorbeeld.goal);

  // De stap van de plus- en minknop hangt af van de eenheid, dus het
  // voorleesetiket ook. Vandaar hier en niet via een data-attribuut.
  const stap = fmtNum(units() === 'imperial' ? 0.2 : 0.1);
  for (const knop of document.querySelectorAll('.stepper__btn')) {
    knop.setAttribute('aria-label', t(
      Number(knop.dataset.step) < 0 ? 'a11y.stepDown' : 'a11y.stepUp', { step: stap }));
  }

  for (const id of ['setHeight', 'setupHeight']) {
    const veld = $(id);
    veld.placeholder = t('eg.value', { n: fmtHeight(VOORBEELD_LENGTE_CM) });
    // Een voet-en-inchnotatie valt niet in te tikken op een cijfertoetsenbord.
    veld.inputMode = units() === 'imperial' ? 'text' : 'numeric';
  }
}

/** De weekdagen komen uit Intl, dus ze volgen vanzelf de gekozen taal. */
function vulWeekdagen() {
  const select = $('setWeekday');
  const gekozen = String(settings.reminderWeekday ?? 1);
  select.replaceChildren();
  // Maandag eerst, zondag als laatste — zo leest een week in beide talen.
  for (const i of [1, 2, 3, 4, 5, 6, 0]) {
    const optie = document.createElement('option');
    optie.value = String(i);
    optie.textContent = weekdayLong(i);
    select.append(optie);
  }
  select.value = gekozen;
}

const langButtons = document.querySelectorAll('#langSegmented .segmented__btn');

function syncLangButtons() {
  for (const b of langButtons) {
    const actief = b.dataset.lang === (settings.language || 'system');
    b.classList.toggle('is-active', actief);
    b.setAttribute('aria-pressed', String(actief));
  }
}

for (const btn of langButtons) {
  btn.addEventListener('click', () => {
    if (btn.dataset.lang === settings.language) return;
    settings = patchSettings({ language: btn.dataset.lang });
    syncLangButtons();
    setLanguage(settings.language);
  });
}

const unitButtons = document.querySelectorAll('#unitSegmented .segmented__btn');

function syncUnitButtons() {
  for (const b of unitButtons) {
    const actief = b.dataset.units === (settings.units || 'system');
    b.classList.toggle('is-active', actief);
    b.setAttribute('aria-pressed', String(actief));
  }
}

for (const btn of unitButtons) {
  btn.addEventListener('click', () => {
    if (btn.dataset.units === settings.units) return;
    settings = patchSettings({ units: btn.dataset.units });
    syncUnitButtons();
    setUnits(settings.units);
  });
}

/** Eén plek die alles opnieuw opbouwt na een wissel van taal of eenheid. */
function herteken() {
  resetFormatCache();          // datums en getallen opnieuw laten opmaken
  applyStaticTranslations();
  fillSettingsForm();

  // De cijfers in het invoerformulier staan in de oude eenheid; opnieuw uit
  // de opslag lezen zet ze goed. De notitie is niets waard in de opslag,
  // dus die houden we los vast.
  const notitie = $('entryNote').value;
  loadDateIntoForm($('entryDate').value || todayISO());
  $('entryNote').value = notitie;

  renderToday();
  renderBmi();
  renderAchieved();
  renderBackupLine();
  renderAppLink();
  renderTelemetrieStatus();
  refreshReminderState();
  if (!$('view-chart').hidden) renderChartView();
  if (!$('view-history').hidden) renderHistory();
}

onLanguageChange(herteken);
onUnitsChange(herteken);

/* ── Platform ───────────────────────────────────────────────── */

/**
 * Draait dit op een iPhone of iPad? Alleen gebruikt om eerlijke teksten te
 * tonen — de app werkt verder overal hetzelfde.
 */
function opIOS() {
  const ua = navigator.userAgent || '';
  if (/iPad|iPhone|iPod/.test(ua)) return true;

  // iPadOS 13 en later doet zich voor als een Mac; alleen de aanraakpunten
  // verraden het nog. Die truc mag alleen in Safari gelden — een Chrome die
  // een telefoon nabootst op een Mac heeft dezelfde kenmerken en is het niet.
  const isSafari = /^((?!chrome|android|crios|fxios|edg).)*safari/i.test(ua);
  return isSafari &&
         navigator.platform === 'MacIntel' &&
         navigator.maxTouchPoints > 1;
}

/** Staat de app op het beginscherm in plaats van in een browsertabblad? */
function staatOpBeginscherm() {
  return window.matchMedia('(display-mode: standalone)').matches ||
         navigator.standalone === true;   // de iOS-variant
}

/* ── Thema ──────────────────────────────────────────────────── */

const THEME_ORDER = ['system', 'light', 'dark'];
const THEME_KEY   = { system: 'theme.system', light: 'theme.light', dark: 'theme.dark' };

function applyTheme(theme) {
  if (theme === 'system') document.documentElement.removeAttribute('data-theme');
  else document.documentElement.setAttribute('data-theme', theme);
}

$('themeToggle').addEventListener('click', () => {
  const next = THEME_ORDER[(THEME_ORDER.indexOf(settings.theme) + 1) % THEME_ORDER.length];
  settings = patchSettings({ theme: next });
  applyTheme(next);
  toast(t('theme.toast', { name: t(THEME_KEY[next]) }));
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
  if (name === 'history') { renderHistory(); renderAchieved(); }
  window.scrollTo({ top: 0 });
}

for (const tab of document.querySelectorAll('.tab')) {
  tab.addEventListener('click', () => showView(tab.dataset.view));
}

/* ── Vandaag ────────────────────────────────────────────────── */

function renderToday() {
  const entries = listEntries();
  const last = entries[entries.length - 1] || null;

  /* hero — het trendgewicht staat voorop zodra dat betekenis heeft */
  const deltaEl = $('heroDelta');
  const toonTrend = hasTrend(entries);
  const trend = toonTrend ? trendWeight(entries) : null;

  $('heroLabel').textContent = t(toonTrend ? 'today.trendWeight' : 'today.currentWeight');
  $('heroWeight').textContent = toonTrend ? fmtWeight(trend) : (last ? fmtWeight(last.kg) : '—');

  if (toonTrend) {
    // Trend versus trend van een week terug: dat filtert de dagruis eruit.
    const eerder = trendAgo(entries, 7);
    if (eerder !== null) {
      const d = trend - eerder;
      deltaEl.textContent = t('today.deltaDays', { delta: fmtWeightDelta(d) });
      setDeltaClass(deltaEl, d);
    } else {
      deltaEl.textContent = '';
      setDeltaClass(deltaEl, null);
    }
    $('heroNote').textContent = t('today.trendNote');
    $('heroDate').textContent = t('today.measured', { date: fmtDateShort(last.date), kg: fmtWeight(last.kg) });
  } else if (entries.length >= 2) {
    const prev = entries[entries.length - 2];
    const d = last.kg - prev.kg;
    deltaEl.textContent = t('today.deltaSince', { delta: fmtWeightDelta(d), date: fmtDateShort(prev.date) });
    setDeltaClass(deltaEl, d);
    $('heroNote').textContent = t('today.trendSoon');
    $('heroDate').textContent = t('today.lastMeasured', { date: fmtDateLong(last.date) });
  } else {
    deltaEl.textContent = '';
    setDeltaClass(deltaEl, null);
    $('heroNote').textContent = '';
    $('heroDate').textContent = last
      ? t('today.lastMeasured', { date: fmtDateLong(last.date) })
      : t('today.noMeasurement');
  }

  /* doel */
  const goalCard = $('goalCard');
  const goal = settings.goalWeight;
  const start = settings.startWeight ?? (entries.length ? entries[0].kg : null);
  if (goal !== null && start !== null && last) {
    goalCard.hidden = false;
    const peil = toonTrend ? trend : last.kg;    // trend is een eerlijker peilstok
    const total = start - goal;
    const done = start - peil;
    const pct = total === 0 ? 100 : Math.max(0, Math.min(100, (done / total) * 100));
    $('goalFill').style.width = `${pct}%`;
    $('goalBar').setAttribute('aria-valuenow', Math.round(pct));
    $('goalStart').textContent = `${fmtWeight(start)} ${unitWeight()}`;
    $('goalTarget').textContent = `${fmtWeight(goal)} ${unitWeight()}`;
    $('goalPct').textContent = `${Math.round(pct)}%`;
    const left = peil - goal;
    $('goalRemaining').textContent = left <= 0
      ? t('goal.reached')
      : t('goal.remaining', { kg: fmtWeight(left) });

    renderForecast(entries, goal);
  } else {
    goalCard.hidden = true;
  }

  /* statistieken */
  const week  = changeOver(entries, 7);
  const month = changeOver(entries, 30);
  const wEl = $('statWeek');
  wEl.textContent = week ? `${fmtWeightDelta(week.delta)} ${unitWeight()}` : '—';
  setDeltaClass(wEl, week?.delta ?? null);

  const mEl = $('statMonth');
  mEl.textContent = month ? `${fmtWeightDelta(month.delta)} ${unitWeight()}` : '—';
  setDeltaClass(mEl, month?.delta ?? null);

  const tEl = $('statTotal');
  if (last && start !== null) {
    const d = last.kg - start;
    tEl.textContent = `${fmtWeightDelta(d)} ${unitWeight()}`;
    setDeltaClass(tEl, d);
  } else {
    tEl.textContent = '—';
    setDeltaClass(tEl, null);
  }

  renderWaist(entries);
  renderBackupNotice();
  renderBackupLine();

  const streak = currentStreak(entries, settings.reminderFrequency);
  $('statStreakLabel').textContent = t(streak.unit === 'week' ? 'stat.streakWeeks' : 'stat.streakDays');
  $('statStreak').textContent = String(streak.count);

  /* hint bij het formulier */
  syncFormHint();
}

/* ── De app delen ───────────────────────────────────────────── */

/** Het adres van de app zelf, los van de pagina waar je nu staat. */
function appAdres() {
  return new URL('.', location.href).href;
}



async function kopieerNaarKlembord(tekst) {
  try {
    await navigator.clipboard.writeText(tekst);
    toast(t('toast.linkCopied'));
    return true;
  } catch {
    // Het klembord mag geweigerd worden. Dan de link maar selecteren, zodat
    // kopiëren met de hand nog één handeling is.
    try {
      const el = $('appLink');
      const bereik = document.createRange();
      bereik.selectNodeContents(el);
      const selectie = window.getSelection();
      selectie.removeAllRanges();
      selectie.addRange(bereik);
      toast(t('toast.copyBlocked'));
    } catch {
      toast(t('toast.copyFailed'));
    }
    return false;
  }
}

$('shareAppBtn').addEventListener('click', async () => {
  const url = appAdres();
  if (typeof navigator.share === 'function') {
    try {
      await navigator.share({ title: t('app.name'), text: t('share.appText'), url });
      return;
    } catch (err) {
      // Het deelmenu wegtikken is geen fout; dan doen we verder niets.
      if (err && err.name === 'AbortError') return;
    }
  }
  await kopieerNaarKlembord(url);
});

$('copyLinkBtn').addEventListener('click', () => kopieerNaarKlembord(appAdres()));

function renderAppLink() {
  $('appLink').textContent = appAdres();
  // Zonder deelmenu is de kopieerknop het enige dat werkt; dan geen loze knop.
  $('shareAppBtn').hidden = typeof navigator.share !== 'function';
}

/* ── Meetellen ──────────────────────────────────────────────── */

function renderTelemetrieStatus() {
  const el = $('telemetrieStatus');
  if (!counterConfigured()) {
    el.textContent = t('counter.notSet');
    return;
  }
  el.textContent = t(settings.telemetrieUit ? 'counter.off' : 'counter.on');
}

$('setTelemetrie').addEventListener('change', (e) => {
  settings = patchSettings({ telemetrieUit: !e.target.checked });
  renderTelemetrieStatus();
  toast(t(e.target.checked ? 'toast.countedIn' : 'toast.countedOut'));
});

/* ── Delen ──────────────────────────────────────────────────── */

let deelCanvas = null;

function tekenDeelVoorbeeld() {
  const entries = listEntries();
  const host = $('sharePreview');
  const leeg = $('shareLeeg');
  const status = kanDelen(entries);

  if (!status.kan) {
    host.replaceChildren();
    host.hidden = true;
    leeg.hidden = false;
    leeg.textContent = status.reden;
    $('shareGo').disabled = true;
    deelCanvas = null;
    return;
  }

  deelCanvas = tekenKaart(entries, settings, { includeWeights: $('shareWeights').checked });
  host.replaceChildren(deelCanvas);
  host.hidden = false;
  leeg.hidden = true;
  $('shareGo').disabled = false;
}

$('shareBtn').addEventListener('click', () => {
  $('shareWeights').checked = false;      // elke keer opnieuw de veilige stand
  tekenDeelVoorbeeld();
  $('shareDialog').showModal();
});

$('shareWeights').addEventListener('change', tekenDeelVoorbeeld);
$('shareClose').addEventListener('click', () => $('shareDialog').close());

$('shareGo').addEventListener('click', async () => {
  if (!deelCanvas) return;
  const knop = $('shareGo');
  knop.disabled = true;

  try {
    const metGewicht = $('shareWeights').checked;
    const bestand = await canvasNaarBestand(deelCanvas, `private-scale-${todayISO()}.png`);
    const tekst = deelTekst(listEntries(), settings, { includeWeights: metGewicht });

    if (kanBestandDelen(bestand)) {
      await navigator.share({ files: [bestand], text: tekst });
      $('shareDialog').close();
    } else {
      // Geen deelmenu (bijvoorbeeld op een laptop): dan maar downloaden.
      const url = URL.createObjectURL(bestand);
      const a = document.createElement('a');
      a.href = url;
      a.download = bestand.name;
      document.body.append(a);
      a.click();
      a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 2000);
      $('shareDialog').close();
      toast(t('toast.imageSaved'));
    }
  } catch (err) {
    // Het deelmenu wegtikken gooit AbortError; dat is geen fout.
    if (err && err.name !== 'AbortError') toast(t('toast.shareFailed'));
  } finally {
    knop.disabled = false;
  }
});

/* ── Aanvulvenster ──────────────────────────────────────────── */

function setupOntbreekt() {
  return { goal: settings.goalWeight === null, lengte: settings.heightCm === null };
}

/**
 * Vraagt om streefgewicht en lengte als die ontbreken. Wegklikbaar met
 * 'Later'; komt de volgende dag terug zolang het onvolledig blijft. Een
 * venster dat je niet kwijt kunt, is na een week alleen maar irritant.
 */
function maybeAskSetup() {
  const mist = setupOntbreekt();
  if (!mist.goal && !mist.lengte) return;
  if (settings.setupDeferredOn === todayISO()) return;

  const dlg = $('setupDialog');
  if (!dlg || typeof dlg.showModal !== 'function') return;   // oudere browser
  if (dlg.open) return;

  $('setupGoalField').hidden = !mist.goal;
  $('setupHeightField').hidden = !mist.lengte;
  $('setupGoal').value = '';
  $('setupHeight').value = '';
  $('setupError').textContent = '';

  $('setupIntro').textContent = t(
    mist.goal && mist.lengte ? 'setup.both' : mist.goal ? 'setup.goal' : 'setup.height');

  dlg.showModal();
}

$('setupForm').addEventListener('submit', (e) => {
  e.preventDefault();
  const mist = setupOntbreekt();
  const fout = $('setupError');
  const patch = {};

  if (mist.goal) {
    const grens = rangeFor('weight');
    const n = parseNum($('setupGoal').value);
    if (n === null || n < grens.min || n > grens.max) {
      fout.textContent = t('toast.setupGoal', grens);
      $('setupGoal').focus();
      return;
    }
    patch.goalWeight = toStoredWeight(n);
  }

  if (mist.lengte) {
    const cm = parseHeightInput($('setupHeight').value);
    if (cm === null || cm < LIMITS.height.min || cm > LIMITS.height.max) {
      fout.textContent = lengteMelding();
      $('setupHeight').focus();
      return;
    }
    patch.heightCm = Math.round(cm);
  }

  settings = patchSettings(patch);
  $('setupDialog').close();

  fillSettingsForm();
  renderToday();
  renderBmi();
  toast(t('toast.setupSaved'));
});

$('setupLater').addEventListener('click', () => $('setupDialog').close());

// Ook bij Escape geldt: vandaag niet meer vragen.
$('setupDialog').addEventListener('close', () => {
  if (setupOntbreekt().goal || setupOntbreekt().lengte) {
    settings = patchSettings({ setupDeferredOn: todayISO() });
  }
});

/* ── Mijlpalen ──────────────────────────────────────────────── */

function showMilestones(nieuw) {
  const card = $('milestoneCard');
  const lijst = $('milestoneList');
  if (!nieuw.length) { card.hidden = true; return; }

  lijst.replaceChildren();
  for (const m of nieuw) {
    const blok = document.createElement('div');
    const titel = document.createElement('div');
    titel.className = 'celebrate__titel';
    titel.textContent = milestoneText(m).titel;
    const tekst = document.createElement('div');
    tekst.className = 'celebrate__tekst';
    tekst.textContent = milestoneText(m).tekst;
    blok.append(titel, tekst);
    lijst.append(blok);
  }
  card.hidden = false;
  card.scrollIntoView({ block: 'nearest' });
}

$('milestoneClose').addEventListener('click', () => { $('milestoneCard').hidden = true; });

function renderAchieved() {
  const behaald = listMilestones();
  const card = $('achievedCard');
  const lijst = $('achievedList');
  card.hidden = behaald.length === 0;
  lijst.replaceChildren();

  for (const m of behaald) {
    const li = document.createElement('li');
    li.className = 'achieved__item';

    const dot = document.createElement('span');
    dot.className = 'achieved__dot';
    dot.textContent = '\u25CF';

    const naam = document.createElement('span');
    naam.className = 'achieved__naam';
    naam.textContent = milestoneText(m).titel;

    const datum = document.createElement('span');
    datum.className = 'achieved__datum';
    datum.textContent = fmtDateShort(m.date);

    li.append(dot, naam, datum);
    lijst.append(li);
  }
}

/** Het kaartje met je middelomtrek; blijft weg tot je er een invult. */
function renderWaist(entries) {
  const kaart = $('waistCard');
  const w = waistSamenvatting(entries);

  if (!w.heeft) { kaart.hidden = true; return; }

  kaart.hidden = false;
  $('waistNow').textContent = fmtLength(w.laatste);
  $('waistDate').textContent = t('waist.measuredOn', { date: fmtDateShort(w.datum) });

  const deltaEl = $('waistDelta');
  if (w.verschil === null) {
    deltaEl.textContent = '';
    setDeltaClass(deltaEl, null);
  } else {
    deltaEl.textContent = t('waist.since', { delta: fmtLengthDelta(w.verschil), date: fmtDateShort(w.vanaf) });
    setDeltaClass(deltaEl, w.verschil);
  }
}

/** Zet de prognoseregel onder de voortgangsbalk. */
function renderForecast(entries, goal) {
  const el = $('goalForecast');
  const f = forecast(entries, goal);
  const tempo = f.rate === null ? null : fmtWeightDelta(f.rate);

  if (f.status === 'ok') {
    // Alleen de datum noemen. Er ook "over N weken" bij zetten leest prettig,
    // maar die afronding klopt zichtbaar niet met de datum als je narekent.
    el.textContent = f.weeks <= 1
      ? t('forecast.withinWeek', { rate: tempo })
      : t('forecast.date', { rate: tempo, date: fmtDateLong(f.eta) });
  } else if (f.status === 'doel-gehaald') {
    el.textContent = t('forecast.done');
  } else if (f.status === 'geen-daling') {
    el.textContent = t('forecast.flat', { rate: tempo });
  } else if (f.status === 'te-ver-weg') {
    el.textContent = t('forecast.faraway', { rate: tempo });
  } else {
    el.textContent = t('forecast.tooLittle');
  }
}

/* ── Invoerformulier ────────────────────────────────────────── */

function syncFormHint() {
  const date = $('entryDate').value;
  const existing = date ? getEntry(date) : null;
  const hint = $('entryHint');
  if (existing) {
    hint.textContent = t('form.exists', { kg: fmtWeight(existing.kg), date: fmtDateShort(date) });
    $('saveBtn').textContent = t('form.update');
  } else {
    hint.textContent = '';
    $('saveBtn').textContent = t('form.save');
  }
}

function loadDateIntoForm(date) {
  $('entryDate').value = date;
  const existing = getEntry(date);
  $('entryWeight').value = existing ? fmtWeight(existing.kg) : '';
  $('entryWaist').value = existing && existing.cm !== null ? fmtLength(existing.cm) : '';
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
    // Alles hier gaat in de eenheid die in het veld staat, niet in kilo's.
    const grens = rangeFor('weight');
    const basis = parseNum(input.value)
      ?? toDisplayWeight(entries.length ? entries[entries.length - 1].kg : 80);
    // 0,1 kg en 0,2 lb schelen allebei zo'n honderd gram: eenzelfde tikje.
    const stap = Number(btn.dataset.step) * (units() === 'imperial' ? 2 : 1);
    const volgende = Math.max(grens.min, Math.min(grens.max, basis + stap));
    input.value = fmtNum(volgende);
  });
}

$('entryForm').addEventListener('submit', (e) => {
  e.preventDefault();
  const date = $('entryDate').value || todayISO();
  const gewichtGrens = rangeFor('weight');
  const ingevoerd = parseNum($('entryWeight').value);

  if (ingevoerd === null || ingevoerd < gewichtGrens.min || ingevoerd > gewichtGrens.max) {
    toast(t('toast.weightRange', gewichtGrens));
    $('entryWeight').focus();
    return;
  }
  const kg = toStoredWeight(ingevoerd);
  if (date > todayISO()) {
    toast(t('toast.noFuture'));
    return;
  }

  const middelGrens = rangeFor('waist');
  const middel = parseNum($('entryWaist').value);
  if (middel !== null && (middel < middelGrens.min || middel > middelGrens.max)) {
    toast(t('toast.waistRange', middelGrens));
    $('entryWaist').focus();
    return;
  }
  const cm = middel === null ? null : toStoredLength(middel);

  const { ok, isNew } = saveEntry(date, kg, $('entryNote').value, cm);
  if (!ok) {
    toast(t('toast.saveFailed'));
    return;
  }

  // Eerste meting? Gebruik die meteen als startgewicht.
  if (settings.startWeight === null && listEntries().length === 1) {
    settings = patchSettings({ startWeight: kg });
    $('setStart').value = fmtWeight(kg);
  }

  toast(isNew
    ? t('toast.saved', { kg: fmtWeight(kg) })
    : t('toast.updated', { date: fmtDateShort(date), kg: fmtWeight(kg) }));
  $('entryNote').value = '';
  $('entryWaist').value = '';
  syncFormHint();
  renderToday();
  refreshReminderState();

  // Alleen vooruit kijken: een oude meting aanpassen deelt geen mijlpalen uit.
  if (date === todayISO()) {
    showMilestones(checkMilestones(listEntries(), settings));
    renderAchieved();
  }
});

/* ── Grafiek ────────────────────────────────────────────────── */

let maat = 'kg';        // 'kg' of 'cm'

const maatButtons = document.querySelectorAll('#maatSegmented .segmented__btn');

for (const btn of maatButtons) {
  btn.addEventListener('click', () => {
    maat = btn.dataset.maat;
    for (const b of maatButtons) {
      const actief = b === btn;
      b.classList.toggle('is-active', actief);
      b.setAttribute('aria-pressed', String(actief));
    }
    renderChartView();
  });
}

const periodButtons = document.querySelectorAll('#periodSegmented .segmented__btn');

for (const btn of periodButtons) {
  btn.addEventListener('click', () => {
    period = btn.dataset.period;
    for (const b of periodButtons) {
      const active = b === btn;
      b.classList.toggle('is-active', active);
      b.setAttribute('aria-selected', String(active));
    }
    renderChartView();
  });
}

function renderChartView() {
  const entries = listEntries();

  // De keuze tussen gewicht en middel verschijnt pas als er iets te kiezen valt.
  const heeftMiddel = entries.some((e) => typeof e.cm === 'number');
  $('maatSegmented').hidden = !heeftMiddel;
  if (!heeftMiddel && maat !== 'kg') {
    maat = 'kg';
    for (const b of maatButtons) {
      const actief = b.dataset.maat === 'kg';
      b.classList.toggle('is-active', actief);
      b.setAttribute('aria-pressed', String(actief));
    }
  }

  const naarScherm = maat === 'cm' ? toDisplayLength : toDisplayWeight;
  const eenheid = maat === 'cm' ? unitLength() : unitWeight();
  const series = buildSeries(entries, period, maat);
  // De grafiek tekent kale getallen; omrekenen gebeurt hier, aan de rand.
  const punten = series.points.map((p) => ({
    ...p,
    value: naarScherm(p.value),
    min: naarScherm(p.min),
    max: naarScherm(p.max),
  }));
  const host = $('chartHost');
  const empty = $('chartEmpty');
  const legend = $('chartLegend');

  $('chartTitle').textContent = series.title || t('nav.chart');
  $('chartSub').textContent = series.subtitle;

  if (!series.points.length) {
    host.replaceChildren();
    empty.hidden = false;
    empty.innerHTML = t(maat === 'cm' ? 'chart.emptyWaist' : 'chart.emptyWeight',
                        { tab: t('nav.today') });
    legend.hidden = true;
    $('chartTrend').textContent = '';
    $('chartMin').textContent = $('chartAvg').textContent = $('chartMax').textContent = '—';
    return;
  }

  empty.hidden = true;
  legend.hidden = !(period === 'day' && series.points.length > 2);
  $('legendMaat').textContent = t(maat === 'cm' ? 'chart.waist' : 'chart.weight');

  let gemiddelden = null;
  if (period === 'day') {
    gemiddelden = new Map();
    for (const [datum, waarde] of movingAverage(entries, 7, maat)) {
      gemiddelden.set(datum, naarScherm(waarde));
    }
  }

  renderChart(host, {
    points: punten,
    mode: series.mode,
    // Het streefgewicht hoort niet in een grafiek over centimeters.
    goal: maat === 'kg' && settings.goalWeight !== null
      ? toDisplayWeight(settings.goalWeight) : null,
    avgMap: gemiddelden,
    eenheid,
  });

  /* trend over de getoonde periode */
  const trendEl = $('chartTrend');
  if (punten.length >= 2) {
    const d = punten[punten.length - 1].value - punten[0].value;
    trendEl.textContent = `${fmtDelta(d)} ${eenheid}`;   // al omgerekend
    setDeltaClass(trendEl, d);
  } else {
    trendEl.textContent = '';
    setDeltaClass(trendEl, null);
  }

  /* laagste / gemiddeld / hoogste over de getoonde punten */
  const lows  = punten.map((p) => p.min);
  const highs = punten.map((p) => p.max);
  const avg   = punten.reduce((a, p) => a + p.value, 0) / punten.length;
  $('chartMin').textContent = `${fmtNum(Math.min(...lows))}`;
  $('chartAvg').textContent = `${fmtNum(avg)}`;
  $('chartMax').textContent = `${fmtNum(Math.max(...highs))}`;
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
    const bijschrift = [
      e.cm !== null ? `${fmtLength(e.cm)} ${unitLength()}` : null,
      e.note || null,
    ].filter(Boolean).join(' · ');

    if (bijschrift) {
      const note = document.createElement('div');
      note.className = 'hitem__note';
      note.textContent = bijschrift;
      main.append(note);
    }

    const kg = document.createElement('div');
    kg.className = 'hitem__kg';
    kg.textContent = fmtWeight(e.kg);

    const dl = document.createElement('div');
    dl.className = 'hitem__delta';
    dl.textContent = delta === null ? '' : fmtWeightDelta(delta);
    setDeltaClass(dl, delta);

    const del = document.createElement('button');
    del.type = 'button';
    del.className = 'hitem__del';
    del.setAttribute('aria-label', t('a11y.deleteEntry', { date: fmtDateLong(e.date) }));
    del.textContent = '✕';
    del.addEventListener('click', (ev) => {
      ev.stopPropagation();
      if (!confirm(t('confirm.delete', { date: fmtDateLong(e.date) }))) return;
      deleteEntry(e.date);
      toast(t('toast.deleted'));
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
    ? t('bmi.noHeight')
    : t('bmi.line', { value: fmtNum(value), label: t(bmiLabel(value)), kg: fmtWeight(last.kg) });
}

/** De melding bij een lengte buiten bereik, in de eenheid van nu. */
function lengteMelding() {
  return t('toast.setupHeight', {
    min: heightBound(LIMITS.height.min, 'up'),
    max: heightBound(LIMITS.height.max, 'down'),
  });
}

/**
 * Koppelt een invoerveld aan een instelling. Het veld staat in de eenheid die
 * de gebruiker koos, de instelling zelf altijd in kilo's of centimeters — dus
 * hier wordt heen en weer gerekend.
 */
function bindMeasureSetting(inputId, key, kind) {
  const input = $(inputId);
  input.addEventListener('change', () => {
    const raw = input.value.trim();

    if (raw === '') {
      settings = patchSettings({ [key]: null });
      input.value = '';
    } else if (kind === 'height') {
      const cm = parseHeightInput(raw);
      if (cm === null || cm < LIMITS.height.min || cm > LIMITS.height.max) {
        toast(lengteMelding());
        input.value = fmtHeight(settings[key]);
        return;
      }
      settings = patchSettings({ [key]: Math.round(cm) });
      input.value = fmtHeight(settings[key]);
    } else {
      const grens = rangeFor('weight');
      const n = parseNum(raw);
      if (n === null || n < grens.min || n > grens.max) {
        toast(t('toast.weightRange', grens));
        input.value = settings[key] === null ? '' : fmtWeight(settings[key]);
        return;
      }
      settings = patchSettings({ [key]: toStoredWeight(n) });
      input.value = fmtWeight(settings[key]);
    }

    renderToday();
    renderBmi();
    if (!$('view-chart').hidden) renderChartView();
  });
}

bindMeasureSetting('setStart',  'startWeight', 'weight');
bindMeasureSetting('setGoal',   'goalWeight',  'weight');
bindMeasureSetting('setHeight', 'heightCm',    'height');

/* herinnering */

/** "elke dag om 08:00" of "elke maandag om 08:00" */
function reminderPhrase(st = settings) {
  const time = st.reminderTime || '08:00';
  return st.reminderFrequency === 'weekly'
    ? t('reminder.everyWeekday', {
        weekday: weekdayLong(Number.isInteger(st.reminderWeekday) ? st.reminderWeekday : 1),
        time,
      })
    : t('reminder.everyDay', { time });
}

async function refreshReminderState() {
  const status = $('notifStatus');
  $('reminderOptions').hidden = !settings.reminderEnabled;
  $('reminderWeekdayField').hidden = settings.reminderFrequency !== 'weekly';

  if (!settings.reminderEnabled) {
    status.textContent = t('reminder.off');
    return;
  }

  // Op een iPhone kan een webapp in een gewoon Safari-tabblad helemaal geen
  // meldingen tonen. Dat eerst zeggen, anders klopt de rest niet.
  if (opIOS() && !staatOpBeginscherm()) {
    status.textContent = t('reminder.iosInstallFirst', { when: reminderPhrase() });
    return;
  }

  if (!notificationsSupported()) {
    status.textContent = t('reminder.unsupported');
    return;
  }

  const perm = permissionState();
  if (perm === 'denied') {
    status.textContent = t('reminder.blocked');
    return;
  }
  if (perm !== 'granted') {
    status.textContent = t('reminder.notYet');
    return;
  }

  const entries = listEntries();
  const lastEntryDate = entries.length ? entries[entries.length - 1].date : null;
  const { background } = await applyReminder({ ...settings, lastEntryDate }, onReminderFires);

  const standalone = staatOpBeginscherm();
  const wanneer = reminderPhrase();

  // iOS kent Periodic Background Sync niet; daar valt niets te wekken.
  if (opIOS()) {
    status.textContent = t('reminder.iosBackground', { when: wanneer });
    return;
  }

  if (background === 'on') {
    status.textContent = t('reminder.background', { when: wanneer });
  } else if (!standalone) {
    status.textContent = t('reminder.needInstall', { when: wanneer });
  } else {
    status.textContent = t('reminder.androidTiming', { when: wanneer });
  }
}

async function onReminderFires() {
  const entries = listEntries();
  const hasToday = entries.some((e) => e.date === todayISO());
  if (hasToday) return;
  await showReminder(t('reminder.body'));
  settings = patchSettings({ lastReminderDate: todayISO() });
}

$('setReminder').addEventListener('change', async (e) => {
  const on = e.target.checked;

  if (on && notificationsSupported() && permissionState() === 'default') {
    const result = await requestPermission();
    if (result !== 'granted') {
      toast(t('toast.noPermission'));
    }
  }

  settings = patchSettings({ reminderEnabled: on });
  await refreshReminderState();
  if (on && permissionState() === 'granted') toast(t('toast.reminderOn', { when: reminderPhrase() }));
});

$('setReminderTime').addEventListener('change', async (e) => {
  const value = e.target.value || '08:00';
  settings = patchSettings({ reminderTime: value });
  await refreshReminderState();
  toast(t('toast.reminder', { when: reminderPhrase() }));
});

const freqButtons = document.querySelectorAll('#freqSegmented .segmented__btn');

for (const btn of freqButtons) {
  btn.addEventListener('click', async () => {
    const freq = btn.dataset.freq;
    if (freq === settings.reminderFrequency) return;

    settings = patchSettings({ reminderFrequency: freq });
    syncFreqButtons();
    // Een nieuwe frequentie mag de herinnering van vandaag opnieuw laten gelden.
    settings = patchSettings({ lastReminderDate: null });
    await refreshReminderState();
    renderToday();          // 'dagen op rij' wordt 'weken op rij'
    toast(t('toast.reminder', { when: reminderPhrase() }));
  });
}

function syncFreqButtons() {
  for (const b of freqButtons) {
    const active = b.dataset.freq === settings.reminderFrequency;
    b.classList.toggle('is-active', active);
    b.setAttribute('aria-pressed', String(active));
  }
  $('reminderWeekdayField').hidden = settings.reminderFrequency !== 'weekly';
}

$('setWeekday').addEventListener('change', async (e) => {
  settings = patchSettings({ reminderWeekday: Number(e.target.value), lastReminderDate: null });
  await refreshReminderState();
  toast(`Herinnering: ${reminderPhrase()}`);
});

$('testNotifBtn').addEventListener('click', async () => {
  if (!notificationsSupported()) { toast(t('toast.notSupported')); return; }
  if (permissionState() === 'default') await requestPermission();
  if (permissionState() !== 'granted') { toast(t('toast.notAllowed')); return; }
  const ok = await showReminder(t('reminder.testBody'));
  toast(t(ok ? 'toast.notifSent' : 'toast.notifFailed'));
});

$('icsBtn').addEventListener('click', () => {
  download('private-scale-reminder.ics', buildIcs(settings), 'text/calendar');
  toast(t('toast.icsSaved'));
});

/* gegevens */

/* ── Back-up ────────────────────────────────────────────────── */

function maakBackup() {
  const entries = listEntries();
  const payload = {
    app: 'private-scale',
    version: 1,
    exportedAt: new Date().toISOString(),
    settings: { ...settings, lastReminderDate: null },
    milestones: getMilestones(),
    entries: entries.map(({ date, kg, cm, note }) => ({ date, kg, cm, note })),
  };
  download(`private-scale-backup-${todayISO()}.json`, JSON.stringify(payload, null, 2), 'application/json');

  // We kunnen niet zien of het bestand ook echt bewaard is; op de knop
  // drukken is het beste wat we hebben.
  settings = patchSettings({
    lastBackupAt: todayISO(),
    lastBackupCount: entries.length,
    backupDeferredUntil: null,
  });
  $('backupCard').hidden = true;
  renderBackupLine();
  toast(t('toast.backupSaved'));
}

/** Het kaartje op Vandaag dat om een back-up vraagt. */
function renderBackupNotice() {
  const st = backupStatus(listEntries(), settings);
  const card = $('backupCard');
  const uitgesteld = settings.backupDeferredUntil && todayISO() < settings.backupDeferredUntil;

  if (!st.nodig || uitgesteld) { card.hidden = true; return; }

  $('backupReden').textContent = st.laatst
    ? t(st.nieuwe === 1 ? 'backup.pendingOne' : 'backup.pending',
        { n: st.nieuwe, date: fmtDateShort(st.laatst) })
    : t('backup.notBackedUp', { n: st.totaal });
  card.hidden = false;
}

/** De regel onder Instellingen → Gegevens. */
function renderBackupLine() {
  const st = backupStatus(listEntries(), settings);
  if (!st.laatst) {
    $('backupStatus').textContent = st.totaal ? t('backup.none') : '';
    return;
  }
  $('backupStatus').textContent = st.nieuwe
    ? t('backup.since', { date: fmtDateLong(st.laatst), n: t('entries.count', { n: st.nieuwe }) })
    : t('backup.upToDate', { date: fmtDateLong(st.laatst) });
}

$('exportJsonBtn').addEventListener('click', maakBackup);
$('backupNow').addEventListener('click', maakBackup);

$('backupLater').addEventListener('click', () => {
  // Twee weken rust. Dagelijks vragen om iets dat niet urgent is, werkt averechts.
  settings = patchSettings({ backupDeferredUntil: addDays(todayISO(), 14) });
  $('backupCard').hidden = true;
});

$('exportCsvBtn').addEventListener('click', () => {
  // Het bestand blijft metrisch, net als de opslag: de kop zegt welke
  // eenheid erin staat, dus het blijft leesbaar los van je instelling.
  const rows = [['date', 'weight_kg', 'waist_cm', 'note']];
  for (const e of listEntries()) {
    rows.push([
      e.date,
      String(e.kg).replace('.', ','),
      e.cm === null ? '' : String(e.cm).replace('.', ','),
      e.note,
    ]);
  }
  const csv = rows
    .map((r) => r.map((c) => (/[";\n]/.test(c) ? `"${c.replace(/"/g, '""')}"` : c)).join(';'))
    .join('\r\n');
  download(`private-scale-${todayISO()}.csv`, csv, 'text/csv');
  toast(t('toast.csvSaved'));
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

      const cm = typeof row.cm === 'number' ? row.cm : parseNum(row.cm);
      if (cm !== null && cm >= 40 && cm <= 200) map[row.date].cm = cm;
    }

    const count = Object.keys(map).length;
    if (!count) { toast(t('toast.noUsable')); return; }
    if (!confirm(t('confirm.restore', { n: count }))) return;

    replaceAllEntries(map);
    if (data.settings && typeof data.settings === 'object') {
      const { startWeight, goalWeight, heightCm, reminderTime,
              reminderFrequency, reminderWeekday } = data.settings;
      settings = patchSettings({
        startWeight: typeof startWeight === 'number' ? startWeight : settings.startWeight,
        goalWeight:  typeof goalWeight  === 'number' ? goalWeight  : settings.goalWeight,
        heightCm:    typeof heightCm    === 'number' ? heightCm    : settings.heightCm,
        reminderTime: /^\d{2}:\d{2}$/.test(reminderTime || '') ? reminderTime : settings.reminderTime,
        reminderFrequency: reminderFrequency === 'weekly' ? 'weekly' : 'daily',
        reminderWeekday: Number.isInteger(reminderWeekday) && reminderWeekday >= 0 && reminderWeekday <= 6
          ? reminderWeekday : settings.reminderWeekday,
      });
    }
    if (data.milestones && typeof data.milestones === 'object' && !Array.isArray(data.milestones)) {
      replaceMilestones(data.milestones);
    }
    // Komt de back-up van vóór de mijlpalen, dan alsnog de historie nalopen.
    backfillMilestones(listEntries(), settings);

    // Je hebt het bestand net nog in handen gehad; dat telt als veilig.
    settings = patchSettings({
      lastBackupAt: todayISO(),
      lastBackupCount: listEntries().length,
      backupDeferredUntil: null,
    });
    fillSettingsForm();
    renderToday();
    renderBmi();
    renderAchieved();
    renderBackupLine();
    toast(t('toast.restored', { n: count }));
  } catch (err) {
    toast(t('toast.readFailed', { error: err.message }));
  }
});

$('wipeBtn').addEventListener('click', () => {
  if (!confirm(t('confirm.wipe'))) return;
  wipeAll();
  settings = getSettings();          // milestonesBackfilled staat weer op false
  applyTheme(settings.theme);
  fillSettingsForm();
  loadDateIntoForm(todayISO());
  renderToday();
  renderBmi();
  renderChartView();
  renderHistory();
  renderAchieved();
  renderBackupLine();
  $('milestoneCard').hidden = true;
  $('backupCard').hidden = true;
  toast(t('toast.wiped'));
});

function fillSettingsForm() {
  $('setStart').value  = settings.startWeight === null ? '' : fmtWeight(settings.startWeight);
  $('setGoal').value   = settings.goalWeight  === null ? '' : fmtWeight(settings.goalWeight);
  $('setHeight').value = fmtHeight(settings.heightCm);
  $('setTelemetrie').checked = !settings.telemetrieUit;
  $('setReminder').checked = !!settings.reminderEnabled;
  $('setReminderTime').value = settings.reminderTime || '08:00';
  $('setWeekday').value = String(Number.isInteger(settings.reminderWeekday) ? settings.reminderWeekday : 1);
  syncFreqButtons();
  $('reminderOptions').hidden = !settings.reminderEnabled;
}

/* ── Zetje wanneer je nog niet gewogen hebt ─────────────────── */

async function nudgeIfDue() {
  settings = getSettings();
  const entries = listEntries();
  const hasToday = entries.some((e) => e.date === todayISO());

  if (!isDue(settings, hasToday)) return;

  if (!alreadyNudgedToday(settings)) {
    await showReminder(t('reminder.bodyMissed'));
    settings = patchSettings({ lastReminderDate: todayISO() });
  }
  toast(t('toast.notWeighed'));
}

/* ── Installeren op het beginscherm ─────────────────────────── */

let deferredInstall = null;

window.addEventListener('beforeinstallprompt', (e) => {
  e.preventDefault();
  deferredInstall = e;
  if (!settings.installDismissed) $('installBanner').hidden = false;
});

/**
 * Safari kent 'beforeinstallprompt' niet, dus op een iPhone verschijnt die
 * banner nooit. Daar tonen we uitleg in plaats van een knop — installeren kan
 * alleen de gebruiker zelf, via het deelmenu van iOS.
 */
function toonIOSInstallatieUitleg() {
  if (!opIOS() || staatOpBeginscherm() || settings.installDismissed) return;

  $('installBtn').hidden = true;      // er valt hier niets te klikken
  $('installBanner').hidden = false;
}

$('installBtn').addEventListener('click', async () => {
  $('installBanner').hidden = true;
  if (!deferredInstall) return;
  deferredInstall.prompt();
  const { outcome } = await deferredInstall.userChoice;
  deferredInstall = null;
  if (outcome === 'accepted') toast(t('toast.installed', { app: t('app.name') }));
});

$('installClose').addEventListener('click', () => {
  $('installBanner').hidden = true;
  settings = patchSettings({ installDismissed: true });
});

window.addEventListener('appinstalled', () => {
  $('installBanner').hidden = true;
  refreshReminderState();
  meldInstallatie();
});

/* ── Service worker en updates ──────────────────────────────── */

let swRegistration = null;

/* Stond er al een service worker aan het roer toen deze pagina laadde?
   Zo niet, dan is dit de allereerste installatie en moeten we níét
   herladen wanneer die het overneemt. */
const hadController = 'serviceWorker' in navigator && !!navigator.serviceWorker.controller;
let reloadingForUpdate = false;

function showUpdateBanner(worker) {
  const banner = $('updateBanner');
  if (!banner || !worker) return;
  $('installBanner').hidden = true;        // één balkje tegelijk
  banner.hidden = false;

  $('updateBtn').onclick = () => {
    $('updateBtn').disabled = true;
    $('updateBtn').textContent = t('update.busy');
    // De wachtende service worker mag het nu overnemen; zodra dat lukt
    // vuurt 'controllerchange' en herlaadt de pagina in één keer.
    worker.postMessage({ type: 'skip-waiting' });
  };
}

function watchForUpdates(reg) {
  // Een versie die al klaarstond van een vorige sessie.
  if (reg.waiting && navigator.serviceWorker.controller) {
    showUpdateBanner(reg.waiting);
  }

  reg.addEventListener('updatefound', () => {
    const incoming = reg.installing;
    if (!incoming) return;
    incoming.addEventListener('statechange', () => {
      // 'installed' mét een bestaande controller betekent: dit is een
      // update, geen eerste installatie.
      if (incoming.state === 'installed' && navigator.serviceWorker.controller) {
        showUpdateBanner(incoming);
      }
    });
  });
}

if ('serviceWorker' in navigator) {
  navigator.serviceWorker.addEventListener('controllerchange', () => {
    if (!hadController || reloadingForUpdate) return;
    reloadingForUpdate = true;
    location.reload();
  });

  window.addEventListener('load', async () => {
    try {
      swRegistration = await navigator.serviceWorker.register('sw.js');
      watchForUpdates(swRegistration);
      await refreshReminderState();
    } catch { /* offline-modus is dan gewoon niet beschikbaar */ }
  });

  navigator.serviceWorker.addEventListener('message', (e) => {
    if (e.data?.type === 'reminder-check') onReminderFires();
    // Melding aangetikt terwijl de app al openstond: er komt dan geen
    // nieuwe navigatie, dus de service worker seint het ons door.
    if (e.data?.type === 'quick-entry') startQuickEntry();
  });
}

/* ── Start ──────────────────────────────────────────────────── */

document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'visible') {
    settings = getSettings();
    renderToday();
    if (!$('view-chart').hidden) renderChartView();
    nudgeIfDue();
    // Kijken of er inmiddels een nieuwe versie op de server staat.
    swRegistration?.update().catch(() => {});
  }
});

window.addEventListener('resize', () => {
  if (!$('view-chart').hidden) renderChartView();
});

/**
 * Zet de cursor in het gewichtsveld en scrolt het in beeld.
 * Android opent het toetsenbord niet vanzelf bij focus zonder aanraking —
 * het veld staat dan wel klaar en in beeld, één tik en je typt.
 */
function startQuickEntry() {
  showView('today');
  loadDateIntoForm(todayISO());

  const input = $('entryWeight');

  // Pas positioneren als de pagina echt klaar is. Eerder werkt niet: de
  // browser herstelt na het laden nog zijn eigen scrollpositie en gooit
  // ons werk daarmee weg.
  // Geen requestAnimationFrame: die staat stil zolang het venster niet
  // zichtbaar is, en dan gebeurt er dus niets. Een timer draait altijd.
  const plaats = () => setTimeout(() => {
    input.scrollIntoView({ block: 'center' });
    input.focus({ preventScroll: true });
    input.select?.();
  }, 0);

  if (document.readyState === 'complete') plaats();
  else window.addEventListener('load', plaats, { once: true });
}

/** Snelkoppelingen en meldingen kunnen de app op een bepaald scherm openen. */
function handleLaunchParams() {
  const params = new URLSearchParams(location.search);
  const view = params.get('view');
  const quick = params.get('quick');

  if (quick === '1') {
    startQuickEntry();
  } else if (view && VIEWS.includes(view)) {
    showView(view);
  } else {
    showView('today');
  }

  // De parameter uit de adresbalk halen, anders herhaalt een verversing dit.
  if (view || quick) {
    history.replaceState(null, '', location.pathname);
  }

  return quick === '1' ? 'quick' : 'normaal';
}

function boot() {
  // Wij bepalen zelf waar de pagina heen scrolt, niet de browser.
  if ('scrollRestoration' in history) history.scrollRestoration = 'manual';

  // Taal én eenheid moeten vaststaan voordat er ook maar één datum of getal
  // opgemaakt wordt, anders staat het eerste scherm in de verkeerde taal of
  // in de verkeerde eenheid.
  setLanguage(settings.language);
  setUnits(settings.units);
  document.documentElement.lang = language();
  applyStaticTranslations();
  syncLangButtons();
  syncUnitButtons();

  applyTheme(settings.theme);

  $('entryDate').max = todayISO();
  $('entryDate').min = addDays(todayISO(), -3650);
  loadDateIntoForm(todayISO());

  fillSettingsForm();

  // Eén keer je bestaande historie nalopen, zodat mijlpalen die je allang
  // bereikt hebt op hun echte datum in het overzicht staan in plaats van
  // vandaag alsnog als feestje langs te komen.
  if (!settings.milestonesBackfilled) {
    backfillMilestones(listEntries(), settings);
    settings = patchSettings({ milestonesBackfilled: true });
  }

  renderToday();
  renderBmi();
  renderAchieved();
  renderBackupLine();
  renderTelemetrieStatus();
  renderAppLink();

  // Niet wachten op de service worker: mislukt die registratie, dan bleef
  // deze regel anders leeg. Zodra de worker er wel is wordt hij nogmaals
  // bijgewerkt, want pas dan is bekend of achtergrondmeldingen mogen.
  refreshReminderState();

  const start = handleLaunchParams();
  nudgeIfDue();
  meldOpening();
  toonIOSInstallatieUitleg();

  // Niet vragen als je via de snelkoppeling komt om even snel te wegen;
  // dan wil je het invoerveld, geen venster ervoor. Volgende keer wel.
  if (start !== 'quick') maybeAskSetup();
}

boot();
