/* ============================================================
   telemetry.js — one message a day, purely to count.

   Er gaat niets anders de deur uit dan of het om een opening of een
   installatie gaat. Geen gewicht, geen doelen, geen mijlpalen, geen
   identificatie. Zie Instellingen → Privacy in de app, en teller/README.md
   voor wat er aan de andere kant gebeurt.
   ============================================================ */

import { todayISO, getSettings, patchSettings } from './store.js';

/**
 * Het adres van je eigen Cloudflare Worker.
 * Zolang hier de standaardwaarde staat, verstuurt de app niets — handig
 * om lokaal te ontwikkelen zonder de teller te vervuilen.
 */
const COUNTER_URL = 'https://private-scale-counter.roboroy.workers.dev';

/** Draaien we op een ontwikkelmachine in plaats van op de echte site? */
function isLocalhost() {
  const h = location.hostname;
  return h === 'localhost' || h === '127.0.0.1' || h === '' || h.endsWith('.local');
}

export function counterConfigured() {
  // Vanaf localhost telt de app niet mee. De Worker zou het verzoek toch
  // weigeren, en zo vervuil je tijdens het ontwikkelen de cijfers niet én
  // hou je de console schoon.
  return /^https:\/\//.test(COUNTER_URL) && !isLocalhost();
}

export function counterAddress() {
  return counterConfigured() ? COUNTER_URL : null;
}

async function stuur(soort) {
  if (!counterConfigured()) return false;
  try {
    await fetch(`${COUNTER_URL}?e=${soort}`, {
      method: 'POST',
      mode: 'cors',
      keepalive: true,
      cache: 'no-store',
    });
    return true;
  } catch {
    // Offline of teller onbereikbaar: gewoon overslaan. Een telling is
    // nooit belangrijk genoeg om iets van te merken.
    return false;
  }
}

/**
 * Hoogstens één keer per kalenderdag per apparaat. Dat maakt het cijfer
 * "hoeveel apparaten openden de app vandaag" in plaats van een ruwe
 * optelsom van schermbezoeken.
 */
export async function meldOpening() {
  const settings = getSettings();
  if (settings.telemetrieUit) return;
  if (settings.telemetrieLaatsteDag === todayISO()) return;

  const gelukt = await stuur('open');
  if (gelukt) patchSettings({ telemetrieLaatsteDag: todayISO() });
}

/** Eén keer per apparaat, op het moment dat je hem op je beginscherm zet. */
export async function meldInstallatie() {
  const settings = getSettings();
  if (settings.telemetrieUit || settings.telemetrieInstallatieGemeld) return;

  const gelukt = await stuur('install');
  if (gelukt) patchSettings({ telemetrieInstallatieGemeld: true });
}

/** De openbare, geaggregeerde cijfers ophalen. */
export async function haalCijfers() {
  if (!counterConfigured()) return null;
  try {
    const res = await fetch(`${COUNTER_URL}/stats`, { cache: 'no-store' });
    if (!res.ok) return null;
    return await res.json();
  } catch {
    return null;
  }
}
