/* ============================================================
   reminders.js — dagelijkse herinnering om te wegen.

   Drie lagen, want een webapp mag niets écht "plannen":
     1. Periodic Background Sync — de service worker wordt door Android
        af en toe gewekt en kijkt of het tijd is. Werkt alleen als de app
        op je beginscherm staat. Dit is de laag die je wakker maakt.
     2. Een timer zolang de app openstaat.
     3. Een inhaalcheck bij elke keer dat je de app opent: was het
        tijdstip al voorbij en heb je nog niet gewogen, dan alsnog een
        melding + een zetje in beeld.

   Daarnaast kan de app een .ics-agendaherinnering exporteren; die loopt
   via je agenda-app en is daarmee de betrouwbaarste optie van allemaal.
   ============================================================ */

import { todayISO } from './store.js';

const TAG = 'afvalapp-weigh-in';

export function notificationsSupported() {
  return typeof Notification !== 'undefined' && 'serviceWorker' in navigator;
}

export function permissionState() {
  if (typeof Notification === 'undefined') return 'unsupported';
  return Notification.permission;                 // 'granted' | 'denied' | 'default'
}

export async function requestPermission() {
  if (typeof Notification === 'undefined') return 'unsupported';
  try {
    return await Notification.requestPermission();
  } catch {
    return 'denied';
  }
}

/* ── Melding tonen (via de service worker, zodat hij ook telt
      wanneer de app op de achtergrond staat) ─────────────────── */

export async function showReminder(body = 'Tijd om je gewicht in te vullen.') {
  if (permissionState() !== 'granted') return false;
  try {
    const reg = await navigator.serviceWorker.ready;
    await reg.showNotification('Afvalapp', {
      body,
      tag: TAG,
      renotify: true,
      icon: 'icons/icon-192.png',
      badge: 'icons/icon-192.png',
      lang: 'nl',
      requireInteraction: false,
      data: { url: './' },
    });
    return true;
  } catch {
    try {
      new Notification('Afvalapp', { body, tag: TAG });
      return true;
    } catch {
      return false;
    }
  }
}

/* ── Configuratie naar de service worker ────────────────────── */

async function pushConfigToSW(settings) {
  try {
    const reg = await navigator.serviceWorker.ready;
    reg.active?.postMessage({
      type: 'config',
      reminderEnabled: !!settings.reminderEnabled,
      reminderTime: settings.reminderTime || '08:00',
      reminderFrequency: settings.reminderFrequency === 'weekly' ? 'weekly' : 'daily',
      reminderWeekday: Number.isInteger(settings.reminderWeekday) ? settings.reminderWeekday : 1,
      lastEntryDate: settings.lastEntryDate || null,
    });
  } catch { /* geen SW: de andere lagen doen hun werk */ }
}

/* ── Periodic Background Sync ───────────────────────────────── */

async function registerPeriodicSync(enabled) {
  try {
    const reg = await navigator.serviceWorker.ready;
    if (!('periodicSync' in reg)) return 'unsupported';

    if (!enabled) {
      await reg.periodicSync.unregister(TAG).catch(() => {});
      return 'off';
    }

    const status = await navigator.permissions
      .query({ name: 'periodic-background-sync' })
      .catch(() => ({ state: 'denied' }));
    if (status.state !== 'granted') return 'not-allowed';

    await reg.periodicSync.register(TAG, { minInterval: 4 * 60 * 60 * 1000 });
    return 'on';
  } catch {
    return 'unsupported';
  }
}

/* ── Timer zolang de app open is ────────────────────────────── */

let timer = null;

/**
 * Het eerstvolgende weegmoment ná `vanaf`. Bij 'weekly' schuift hij door
 * naar de gekozen weekdag. Zowel de planning als de agenda-export rekenen
 * hiermee, zodat ze niet uit elkaar kunnen lopen.
 */
export function nextOccurrence(settings, vanaf = new Date()) {
  const [h, m] = (settings.reminderTime || '08:00').split(':').map(Number);
  const next = new Date(vanaf);
  next.setHours(h, m, 0, 0);

  if (settings.reminderFrequency === 'weekly') {
    const target = Number.isInteger(settings.reminderWeekday) ? settings.reminderWeekday : 1;
    let vooruit = (target - next.getDay() + 7) % 7;
    if (vooruit === 0 && next <= vanaf) vooruit = 7;  // vandaag is de dag, maar het moment is geweest
    next.setDate(next.getDate() + vooruit);
  } else if (next <= vanaf) {
    next.setDate(next.getDate() + 1);
  }

  return next;
}

function msUntilNext(settings) {
  const now = new Date();
  return nextOccurrence(settings, now) - now;
}

function scheduleInPage(settings, onFire) {
  clearTimeout(timer);
  timer = null;
  if (!settings.reminderEnabled || permissionState() !== 'granted') return;

  const delay = msUntilNext(settings);
  // setTimeout is onbetrouwbaar boven ~24 dagen en bij bevroren tabs;
  // hier gaat het om hooguit 24 uur en de inhaalcheck vangt de rest op.
  timer = setTimeout(async () => {
    await onFire();
    scheduleInPage(settings, onFire);
  }, delay);
}

/* ── Publieke API ───────────────────────────────────────────── */

/**
 * Zet de herinnering aan/uit en synchroniseert alle lagen.
 * @returns {Promise<{permission:string, background:string}>}
 */
export async function applyReminder(settings, onFire) {
  await pushConfigToSW(settings);
  const background = await registerPeriodicSync(!!settings.reminderEnabled);
  scheduleInPage(settings, onFire);
  return { permission: permissionState(), background };
}

/**
 * Inhaalcheck bij openen of terugkeren naar de app.
 * @returns {boolean} true als er vandaag nog gewogen moet worden en het tijdstip voorbij is
 */
export function isDue(settings, hasEntryToday) {
  if (!settings.reminderEnabled || hasEntryToday) return false;

  const now = new Date();

  if (settings.reminderFrequency === 'weekly') {
    const target = Number.isInteger(settings.reminderWeekday) ? settings.reminderWeekday : 1;
    if (now.getDay() !== target) return false;      // vandaag is de dag niet
  }

  const [h, m] = (settings.reminderTime || '08:00').split(':').map(Number);
  const due = new Date(now);
  due.setHours(h, m, 0, 0);
  return now >= due;
}

export function alreadyNudgedToday(settings) {
  return settings.lastReminderDate === todayISO();
}

/* ── Agenda-export (.ics) ───────────────────────────────────── */

function icsStamp(date) {
  return date.toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '');
}

const ICS_DAYS = ['SU', 'MO', 'TU', 'WE', 'TH', 'FR', 'SA'];

/**
 * Terugkerende agenda-afspraak met een alarm op het tijdstip zelf.
 * Volgt dezelfde instelling als de app: elke dag, of wekelijks op één dag.
 */
export function buildIcs(settings) {
  const weekly = settings.reminderFrequency === 'weekly';
  const weekday = Number.isInteger(settings.reminderWeekday) ? settings.reminderWeekday : 1;

  const start = nextOccurrence(settings);
  const end = new Date(start.getTime() + 10 * 60000);

  const local = (d) =>
    `${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, '0')}${String(d.getDate()).padStart(2, '0')}` +
    `T${String(d.getHours()).padStart(2, '0')}${String(d.getMinutes()).padStart(2, '0')}00`;

  const tz = Intl.DateTimeFormat().resolvedOptions().timeZone || 'Europe/Amsterdam';
  const uid = `afvalapp-${Date.now()}@localhost`;

  return [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//Afvalapp//NL',
    'CALSCALE:GREGORIAN',
    'METHOD:PUBLISH',
    'BEGIN:VEVENT',
    `UID:${uid}`,
    `DTSTAMP:${icsStamp(new Date())}`,
    `DTSTART;TZID=${tz}:${local(start)}`,
    `DTEND;TZID=${tz}:${local(end)}`,
    weekly ? `RRULE:FREQ=WEEKLY;BYDAY=${ICS_DAYS[weekday]}` : 'RRULE:FREQ=DAILY',
    'SUMMARY:Wegen — Afvalapp',
    'DESCRIPTION:Vul je gewicht in de Afvalapp in.',
    'BEGIN:VALARM',
    'TRIGGER:PT0M',
    'ACTION:DISPLAY',
    'DESCRIPTION:Wegen — Afvalapp',
    'END:VALARM',
    'END:VEVENT',
    'END:VCALENDAR',
  ].join('\r\n');
}
