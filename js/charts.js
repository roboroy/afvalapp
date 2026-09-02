/* ============================================================
   charts.js — SVG-lijngrafiek zonder externe libraries.
   Werkt voor twee soorten reeksen:
     mode 'time'   → losse metingen op een echte datum-as (dagweergave)
     mode 'bucket' → gemiddelden per week/maand/jaar, gelijk verdeeld,
                     met een band van laagste tot hoogste meting
   ============================================================ */

import { fromISO, fmtKg } from './store.js';

const VB_W = 340;
const VB_H = 210;
const PAD  = { top: 14, right: 12, bottom: 26, left: 34 };

const PLOT_W = VB_W - PAD.left - PAD.right;
const PLOT_H = VB_H - PAD.top - PAD.bottom;

const NICE_STEPS = [0.25, 0.5, 1, 2, 2.5, 5, 10, 20, 25, 50, 100];

function niceStep(span, targetTicks = 4) {
  const rough = span / targetTicks;
  return NICE_STEPS.find((s) => s >= rough) ?? NICE_STEPS[NICE_STEPS.length - 1];
}

function svgEl(name, attrs = {}) {
  const el = document.createElementNS('http://www.w3.org/2000/svg', name);
  for (const [k, v] of Object.entries(attrs)) el.setAttribute(k, String(v));
  return el;
}

/** Kiest ~`max` gelijk verdeelde indices uit 0..n-1, altijd inclusief eerste en laatste. */
function tickIndices(n, max = 5) {
  if (n <= max) return [...Array(n).keys()];
  const out = new Set([0, n - 1]);
  const step = (n - 1) / (max - 1);
  for (let i = 1; i < max - 1; i++) out.add(Math.round(i * step));
  return [...out].sort((a, b) => a - b);
}

function pathFrom(coords) {
  return coords.map((c, i) => `${i === 0 ? 'M' : 'L'}${c.x.toFixed(2)} ${c.y.toFixed(2)}`).join(' ');
}

/**
 * Tekent de grafiek in `host`.
 * @param {HTMLElement} host
 * @param {object} opts
 * @param {Array}  opts.points   punten uit buildSeries()
 * @param {string} opts.mode     'time' | 'bucket'
 * @param {number|null} opts.goal        streefgewicht, of null
 * @param {Map|null}    opts.avgMap      datum → voortschrijdend gemiddelde (alleen 'time')
 */
export function renderChart(host, { points, mode, goal = null, avgMap = null }) {
  host.replaceChildren();
  if (!points.length) return;

  /* ── y-schaal ─────────────────────────────────────────── */
  const lows  = points.map((p) => p.min);
  const highs = points.map((p) => p.max);
  let dMin = Math.min(...lows);
  let dMax = Math.max(...highs);

  if (dMax - dMin < 1.5) {                    // vlakke reeks: geef 'm lucht
    const mid = (dMin + dMax) / 2;
    dMin = mid - 0.75;
    dMax = mid + 0.75;
  }
  const pad = (dMax - dMin) * 0.12;
  let yMin = dMin - pad;
  let yMax = dMax + pad;

  const step = niceStep(yMax - yMin);
  yMin = Math.floor(yMin / step) * step;
  yMax = Math.ceil(yMax / step) * step;

  const yToPx = (v) => PAD.top + PLOT_H * (1 - (v - yMin) / (yMax - yMin));

  /* ── x-schaal ─────────────────────────────────────────── */
  let xToPx;
  if (mode === 'time' && points.length > 1) {
    const t0 = fromISO(points[0].date).getTime();
    const t1 = fromISO(points[points.length - 1].date).getTime();
    const span = Math.max(t1 - t0, 1);
    xToPx = (p) => PAD.left + PLOT_W * ((fromISO(p.date).getTime() - t0) / span);
  } else if (points.length > 1) {
    xToPx = (_p, i) => PAD.left + (PLOT_W * i) / (points.length - 1);
  } else {
    xToPx = () => PAD.left + PLOT_W / 2;
  }

  const coords = points.map((p, i) => ({
    x: xToPx(p, i),
    y: yToPx(p.value),
    yMinPx: yToPx(p.min),
    yMaxPx: yToPx(p.max),
    p,
    i,
  }));

  /* ── SVG opbouwen ─────────────────────────────────────── */
  const svg = svgEl('svg', {
    viewBox: `0 0 ${VB_W} ${VB_H}`,
    preserveAspectRatio: 'xMidYMid meet',
    role: 'img',
    'aria-label': `Gewichtsgrafiek met ${points.length} ${points.length === 1 ? 'punt' : 'punten'}`,
  });

  const defs = svgEl('defs');
  const grad = svgEl('linearGradient', { id: 'afvalGrad', x1: '0', y1: '0', x2: '0', y2: '1' });
  const s1 = svgEl('stop', { offset: '0' });   s1.style.cssText = 'stop-color:var(--accent);stop-opacity:.30';
  const s2 = svgEl('stop', { offset: '1' });   s2.style.cssText = 'stop-color:var(--accent);stop-opacity:.02';
  grad.append(s1, s2);
  defs.append(grad);
  svg.append(defs);

  /* rasterlijnen + y-labels */
  for (let v = yMin; v <= yMax + 1e-9; v += step) {
    const y = yToPx(v);
    svg.append(svgEl('line', { class: 'c-grid', x1: PAD.left, y1: y, x2: VB_W - PAD.right, y2: y }));
    const lbl = svgEl('text', { class: 'c-axis', x: PAD.left - 6, y: y + 3.2, 'text-anchor': 'end' });
    lbl.textContent = fmtKg(v, step < 1 ? 1 : 0);
    svg.append(lbl);
  }

  /* streefgewicht, als het binnen beeld valt */
  if (goal !== null && goal >= yMin && goal <= yMax) {
    const gy = yToPx(goal);
    svg.append(svgEl('line', { class: 'c-goal', x1: PAD.left, y1: gy, x2: VB_W - PAD.right, y2: gy }));
    const gt = svgEl('text', { class: 'c-goal-t', x: VB_W - PAD.right, y: gy - 4, 'text-anchor': 'end' });
    gt.textContent = 'doel';
    svg.append(gt);
  }

  /* vlak: bij buckets de band laagste–hoogste, anders onder de lijn */
  if (mode === 'bucket' && points.some((p) => p.max > p.min)) {
    const top  = coords.map((c) => ({ x: c.x, y: c.yMaxPx }));
    const bot  = [...coords].reverse().map((c) => ({ x: c.x, y: c.yMinPx }));
    svg.append(svgEl('path', { class: 'c-area', d: `${pathFrom(top)} ${pathFrom(bot).replace(/^M/, 'L')} Z` }));
  } else if (coords.length > 1) {
    const base = VB_H - PAD.bottom;
    const d = `${pathFrom(coords)} L${coords[coords.length - 1].x.toFixed(2)} ${base} L${coords[0].x.toFixed(2)} ${base} Z`;
    svg.append(svgEl('path', { class: 'c-area', d }));
  }

  /* voortschrijdend gemiddelde (alleen dagweergave) */
  if (mode === 'time' && avgMap && coords.length > 2) {
    const avgCoords = coords
      .filter((c) => avgMap.has(c.p.date))
      .map((c) => ({ x: c.x, y: yToPx(avgMap.get(c.p.date)) }));
    if (avgCoords.length > 1) {
      svg.append(svgEl('path', { class: 'c-avg', d: pathFrom(avgCoords) }));
    }
  }

  /* de lijn zelf */
  if (coords.length > 1) {
    svg.append(svgEl('path', { class: 'c-line', d: pathFrom(coords) }));
  }

  /* punten — bij veel metingen alleen het laatste, anders wordt het rommelig */
  const showAllDots = coords.length <= 32;
  const selLine = svgEl('line', { class: 'c-sel', x1: 0, y1: PAD.top, x2: 0, y2: VB_H - PAD.bottom, opacity: 0 });
  svg.append(selLine);

  const dots = coords.map((c, i) => {
    const visible = showAllDots || i === coords.length - 1;
    const dot = svgEl('circle', { class: 'c-dot', cx: c.x, cy: c.y, r: visible ? 3.4 : 0 });
    svg.append(dot);
    return dot;
  });

  /* x-labels: eerst allemaal tekenen, daarna de echte breedtes meten en
     botsende labels weghalen. Meten kan pas als de SVG in de pagina staat. */
  const labelGroups = [];
  for (const i of tickIndices(points.length, points.length > 8 ? 5 : 6)) {
    const anchor = i === 0 ? 'start' : i === points.length - 1 ? 'end' : 'middle';
    const g = svgEl('g');

    const t = svgEl('text', {
      class: 'c-axis',
      x: coords[i].x,
      y: VB_H - PAD.bottom + 14,
      'text-anchor': anchor,
    });
    t.textContent = points[i].label;
    g.append(t);

    if (points[i].sublabel && points.length <= 14) {
      const sub = svgEl('text', {
        class: 'c-axis',
        x: coords[i].x,
        y: VB_H - PAD.bottom + 23,
        'text-anchor': anchor,
        opacity: '.7',
      });
      sub.textContent = points[i].sublabel;
      g.append(sub);
    }

    svg.append(g);
    labelGroups.push(g);
  }

  host.append(svg);

  /* Nu de SVG in de pagina staat kunnen we echt meten. Van rechts naar links,
     zodat het laatste label — de meest recente datum — altijd blijft staan. */
  pruneCollidingLabels(labelGroups);


  /* ── tooltip ──────────────────────────────────────────── */
  const tip = document.createElement('div');
  tip.className = 'tip';
  host.append(tip);

  let active = -1;

  function pick(clientX) {
    const rect = svg.getBoundingClientRect();
    if (!rect.width) return -1;
    const vx = ((clientX - rect.left) / rect.width) * VB_W;
    let best = 0, bestD = Infinity;
    coords.forEach((c, i) => {
      const d = Math.abs(c.x - vx);
      if (d < bestD) { bestD = d; best = i; }
    });
    return best;
  }

  function show(i) {
    if (i < 0 || i === active) return;
    active = i;
    const c = coords[i];
    const p = points[i];

    dots.forEach((dot, j) => dot.setAttribute('r', j === i ? 5 : (showAllDots || j === coords.length - 1) ? 3.4 : 0));
    selLine.setAttribute('x1', c.x);
    selLine.setAttribute('x2', c.x);
    selLine.setAttribute('opacity', 1);

    const parts = [`${fmtKg(p.value)} kg`];
    if (p.count > 1) parts.push(`${p.label} · ${p.count} metingen`);
    else parts.push(p.label);
    tip.textContent = parts.join(' · ');

    const rect = svg.getBoundingClientRect();
    const scale = rect.width / VB_W;
    tip.style.left = `${c.x * scale}px`;
    tip.style.top  = `${c.y * scale}px`;
    tip.classList.add('is-on');
  }

  function hide() {
    active = -1;
    tip.classList.remove('is-on');
    selLine.setAttribute('opacity', 0);
    dots.forEach((dot, j) => dot.setAttribute('r', (showAllDots || j === coords.length - 1) ? 3.4 : 0));
  }

  svg.addEventListener('pointerdown', (e) => show(pick(e.clientX)));
  svg.addEventListener('pointermove', (e) => { if (e.pressure > 0 || e.pointerType === 'mouse') show(pick(e.clientX)); });
  svg.addEventListener('pointerleave', hide);
  svg.addEventListener('pointercancel', hide);
  host.addEventListener('pointerdown', (e) => { if (e.target === host) hide(); });
}

/** Verwijdert labelgroepen die over hun rechterbuur heen vallen. */
function pruneCollidingLabels(groups, gap = 4) {
  let leftLimit = Infinity;
  for (let i = groups.length - 1; i >= 0; i--) {
    let box;
    try {
      box = groups[i].getBBox();
    } catch {
      return;                        // niet gerenderd: laat alles staan
    }
    if (!box || box.width === 0) return;
    if (box.x + box.width + gap <= leftLimit) {
      leftLimit = box.x;
    } else {
      groups[i].remove();
    }
  }
}
