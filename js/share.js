/* ============================================================
   share.js — tekent een deelbare kaart op een canvas.

   Standaard staan er geen kilo's in: je ziet dat de lijn daalt en
   hoeveel eraf is, maar niet wat iemand weegt. Met `includeWeights`
   komen de absolute getallen er alsnog bij.
   ============================================================ */

import {
  movingAverage, trendWeight, hasTrend, currentStreak,
  fmtNum, fmtDateLong, fromISO, addDays,
  fmtWeight, fmtWeightDelta, toDisplayWeight,
} from './store.js';

import { t, unitWeight } from './i18n.js';

const W = 1080;
const H = 1080;
const PAD = 84;

const KLEUR = {
  bg:      '#0b1220',
  paneel:  '#141d2e',
  rand:    '#223049',
  tekst:   '#e8edf4',
  zacht:   '#98a5b8',
  vaag:    '#6b7889',
  accent:  '#34d399',
  accent2: '#059669',
  rood:    '#f87171',
  raster:  '#1e2b41',
};

const FONT = "system-ui, -apple-system, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif";
const f = (gewicht, grootte) => `${gewicht} ${grootte}px ${FONT}`;

function rondeRechthoek(ctx, x, y, b, h, r) {
  const straal = Math.min(r, b / 2, h / 2);
  ctx.beginPath();
  ctx.moveTo(x + straal, y);
  ctx.arcTo(x + b, y, x + b, y + h, straal);
  ctx.arcTo(x + b, y + h, x, y + h, straal);
  ctx.arcTo(x, y + h, x, y, straal);
  ctx.arcTo(x, y, x + b, y, straal);
  ctx.closePath();
}

/** De punten voor de lijn: trendwaarden over hoogstens de laatste 180 dagen. */
function lijnPunten(entries) {
  const eind = entries[entries.length - 1].date;
  const vanaf = addDays(eind, -179);
  const sel = entries.filter((e) => e.date >= vanaf);
  const avg = movingAverage(entries, 7);
  // Vanaf hier rekent de kaart in de eenheid van de gebruiker.
  return sel.map((e) => ({ date: e.date, v: toDisplayWeight(avg.get(e.date) ?? e.kg) }));
}

function tekenGrafiek(ctx, punten, vak, toonAsLabels) {
  const { x, y, h } = vak;
  if (punten.length < 2) return;

  // Met aslabels krijgt de tekst een eigen strook links, anders loopt de
  // lijn er dwars doorheen.
  const strook = toonAsLabels ? 78 : 0;
  const px0 = x + strook;
  const b = vak.b - strook;

  const waarden = punten.map((p) => p.v);
  let min = Math.min(...waarden);
  let max = Math.max(...waarden);
  if (max - min < 1) { const m = (min + max) / 2; min = m - 0.5; max = m + 0.5; }
  const marge = (max - min) * 0.18;
  min -= marge; max += marge;

  const t0 = fromISO(punten[0].date).getTime();
  const t1 = fromISO(punten[punten.length - 1].date).getTime();
  const spanT = Math.max(t1 - t0, 1);

  const px = (p) => px0 + b * ((fromISO(p.date).getTime() - t0) / spanT);
  const py = (v) => y + h * (1 - (v - min) / (max - min));

  // rasterlijnen
  ctx.strokeStyle = KLEUR.raster;
  ctx.lineWidth = 2;
  for (let i = 0; i <= 3; i++) {
    const ly = y + (h * i) / 3;
    ctx.beginPath();
    ctx.moveTo(px0, ly);
    ctx.lineTo(px0 + b, ly);
    ctx.stroke();
  }

  if (toonAsLabels) {
    ctx.fillStyle = KLEUR.vaag;
    ctx.font = f(500, 24);
    ctx.textAlign = 'right';
    ctx.textBaseline = 'middle';
    for (let i = 0; i <= 3; i++) {
      const waarde = max - ((max - min) * i) / 3;
      ctx.fillText(fmtNum(waarde, 0), px0 - 16, y + (h * i) / 3);
    }
    ctx.textBaseline = 'alphabetic';
  }

  const coords = punten.map((p) => ({ x: px(p), y: py(p.v) }));

  // vlak onder de lijn
  const verloop = ctx.createLinearGradient(0, y, 0, y + h);
  verloop.addColorStop(0, 'rgba(52, 211, 153, .34)');
  verloop.addColorStop(1, 'rgba(52, 211, 153, .02)');
  ctx.fillStyle = verloop;
  ctx.beginPath();
  ctx.moveTo(coords[0].x, coords[0].y);
  for (const c of coords.slice(1)) ctx.lineTo(c.x, c.y);
  ctx.lineTo(coords[coords.length - 1].x, y + h);
  ctx.lineTo(coords[0].x, y + h);
  ctx.closePath();
  ctx.fill();

  // de lijn
  ctx.strokeStyle = KLEUR.accent;
  ctx.lineWidth = 7;
  ctx.lineJoin = 'round';
  ctx.lineCap = 'round';
  ctx.beginPath();
  ctx.moveTo(coords[0].x, coords[0].y);
  for (const c of coords.slice(1)) ctx.lineTo(c.x, c.y);
  ctx.stroke();

  // eindpunt
  const laatste = coords[coords.length - 1];
  ctx.fillStyle = KLEUR.bg;
  ctx.beginPath();
  ctx.arc(laatste.x, laatste.y, 15, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = KLEUR.accent;
  ctx.lineWidth = 7;
  ctx.stroke();
}

/**
 * Kan er iets zinnigs gedeeld worden?
 * @returns {{kan: boolean, reden: string}}
 */
export function kanDelen(entries) {
  if (entries.length < 3 || !hasTrend(entries)) {
    return { kan: false, reden: t('card.tooFew') };
  }
  return { kan: true, reden: '' };
}

/**
 * Tekent de kaart en geeft het canvas terug.
 * @param {Array} entries
 * @param {object} settings
 * @param {{includeWeights?: boolean}} opties
 */
export function tekenKaart(entries, settings, { includeWeights = false } = {}) {
  const canvas = document.createElement('canvas');
  canvas.width = W;
  canvas.height = H;
  const ctx = canvas.getContext('2d');

  const start = settings.startWeight ?? entries[0].kg;
  const nu = trendWeight(entries);
  const verschil = nu - start;
  const doel = settings.goalWeight;
  const reeks = currentStreak(entries, settings.reminderFrequency);

  /* achtergrond */
  const bg = ctx.createLinearGradient(0, 0, W, H);
  bg.addColorStop(0, '#0d1526');
  bg.addColorStop(1, KLEUR.bg);
  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, W, H);

  ctx.fillStyle = KLEUR.paneel;
  rondeRechthoek(ctx, PAD / 2, PAD / 2, W - PAD, H - PAD, 48);
  ctx.fill();
  ctx.strokeStyle = KLEUR.rand;
  ctx.lineWidth = 2;
  ctx.stroke();

  /* kop */
  ctx.textAlign = 'center';
  ctx.textBaseline = 'alphabetic';
  ctx.fillStyle = KLEUR.vaag;
  ctx.font = f(650, 28);
  ctx.letterSpacing = '4px';
  ctx.fillText(t('card.title'), W / 2, 190);
  ctx.letterSpacing = '0px';

  /* het grote getal */
  const daalt = verschil < 0;
  ctx.fillStyle = daalt ? KLEUR.accent : KLEUR.rood;
  ctx.font = f(700, 150);
  ctx.fillText(`${fmtWeightDelta(verschil)} ${unitWeight()}`, W / 2, 320);

  ctx.fillStyle = KLEUR.zacht;
  ctx.font = f(450, 34);
  ctx.fillText(t('card.since', { date: fmtDateLong(entries[0].date) }), W / 2, 378);

  /* grafiek */
  tekenGrafiek(ctx, lijnPunten(entries), { x: PAD, y: 440, b: W - PAD * 2, h: 300 }, includeWeights);

  /* voortgang naar het doel */
  let y = 830;
  if (doel !== null && doel !== undefined && start > doel) {
    const pct = Math.max(0, Math.min(100, ((start - nu) / (start - doel)) * 100));
    const balkB = W - PAD * 2;

    ctx.fillStyle = '#1b2740';
    rondeRechthoek(ctx, PAD, y, balkB, 22, 11);
    ctx.fill();

    const gv = ctx.createLinearGradient(PAD, 0, PAD + balkB, 0);
    gv.addColorStop(0, KLEUR.accent);
    gv.addColorStop(1, KLEUR.accent2);
    ctx.fillStyle = gv;
    rondeRechthoek(ctx, PAD, y, Math.max(22, (balkB * pct) / 100), 22, 11);
    ctx.fill();

    y += 66;
    ctx.font = f(650, 32);
    if (includeWeights) {
      ctx.textAlign = 'left';
      ctx.fillStyle = KLEUR.vaag;
      ctx.fillText(`${fmtWeight(start)} ${unitWeight()}`, PAD, y);
      ctx.textAlign = 'right';
      ctx.fillText(t('card.goal', { kg: fmtWeight(doel) }), W - PAD, y);
      ctx.textAlign = 'center';
      ctx.fillStyle = KLEUR.tekst;
      ctx.fillText(`${Math.round(pct)}%`, W / 2, y);
    } else {
      ctx.textAlign = 'center';
      ctx.fillStyle = KLEUR.tekst;
      ctx.fillText(t('card.pctOfGoal', { pct: Math.round(pct) }), W / 2, y);
    }
    y += 62;
  } else if (includeWeights) {
    ctx.textAlign = 'center';
    ctx.fillStyle = KLEUR.zacht;
    ctx.font = f(650, 32);
    ctx.fillText(t('card.now', { kg: fmtWeight(nu) }), W / 2, y);
    y += 62;
  }

  /* voettekst */
  ctx.font = f(500, 30);
  ctx.textAlign = 'left';
  ctx.fillStyle = KLEUR.vaag;
  ctx.fillText(
    reeks.count > 1
      ? t(reeks.unit === 'week' ? 'card.weighedWeeks' : 'card.weighedDays', { n: reeks.count })
      : t('card.measurements', { n: entries.length }),
    PAD, H - 116,
  );

  ctx.textAlign = 'right';
  ctx.fillStyle = KLEUR.accent;
  ctx.font = f(700, 30);
  ctx.fillText(t('app.name'), W - PAD, H - 116);

  return canvas;
}

/** De begeleidende tekst bij de afbeelding. */
export function deelTekst(entries, settings, { includeWeights = false } = {}) {
  const start = settings.startWeight ?? entries[0].kg;
  const nu = trendWeight(entries);
  const verschil = nu - start;
  const doel = settings.goalWeight;

  const delen = [`${fmtWeightDelta(verschil)} ${unitWeight()} ${t('card.since', { date: fmtDateLong(entries[0].date) })}`];

  if (doel !== null && doel !== undefined && start > doel) {
    const pct = Math.max(0, Math.min(100, ((start - nu) / (start - doel)) * 100));
    delen.push(t('card.pctOfGoal', { pct: Math.round(pct) }));
  }
  if (includeWeights) {
    delen.push(t('card.now', { kg: fmtWeight(nu) }));
  }
  return delen.join(' · ');
}

/** Zet het canvas om in een bestand dat gedeeld kan worden. */
export function canvasNaarBestand(canvas, naam = 'progress.png') {
  return new Promise((resolve, reject) => {
    canvas.toBlob((blob) => {
      if (!blob) { reject(new Error('kon geen afbeelding maken')); return; }
      resolve(new File([blob], naam, { type: 'image/png' }));
    }, 'image/png');
  });
}

export function kanBestandDelen(bestand) {
  return typeof navigator.canShare === 'function' &&
         typeof navigator.share === 'function' &&
         navigator.canShare({ files: [bestand] });
}
