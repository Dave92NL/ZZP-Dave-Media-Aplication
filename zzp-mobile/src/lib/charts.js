// Lekkie wykresy jako inline SVG (bez bibliotek, offline-first). Skalują się
// proporcjonalnie (viewBox + preserveAspectRatio). Kolory serii przychód/koszt
// są dodatkowo rozróżnione stałą pozycją (lewy/prawy słupek) i legendą, więc
// tożsamość nie zależy tylko od barwy (bezpieczne dla daltonizmu).
//
// UWAGA: zmienne CSS (var(--…)) działają tylko w inline `style`, NIE w atrybutach
// prezentacji SVG (stroke=/fill=). Dlatego kolory podajemy przez style="".

let _uid = 0;
const nextId = (p) => `${p}-${++_uid}`;

const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;');

// ── Sparkline z wypełnieniem (hero „Przychód netto") ──────────────────────────
export function areaSparkline(values, { color = '#34C77E', height = 96, width = 320 } = {}) {
  const vals = (values && values.length ? values : [0, 0]).map(v => Number(v) || 0);
  if (vals.length === 1) vals.unshift(vals[0]);
  const pad = 8;
  const min = Math.min(...vals, 0);
  const max = Math.max(...vals, 1);
  const span = max - min || 1;
  const innerW = width - pad * 2;
  const innerH = height - pad * 2;
  const x = (i) => pad + (innerW * i) / (vals.length - 1);
  const y = (v) => pad + innerH - (innerH * (v - min)) / span;

  const line = vals.map((v, i) => `${i === 0 ? 'M' : 'L'}${x(i).toFixed(1)} ${y(v).toFixed(1)}`).join(' ');
  const area = `${line} L${x(vals.length - 1).toFixed(1)} ${(height - pad).toFixed(1)} L${x(0).toFixed(1)} ${(height - pad).toFixed(1)} Z`;
  const gid = nextId('spark');
  const lastX = x(vals.length - 1).toFixed(1);
  const lastY = y(vals[vals.length - 1]).toFixed(1);

  return `
<svg viewBox="0 0 ${width} ${height}" width="100%" preserveAspectRatio="xMidYMid meet" role="img" aria-label="Trend przychodu">
  <defs>
    <linearGradient id="${gid}" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0%" style="stop-color:${color};stop-opacity:0.34"/>
      <stop offset="100%" style="stop-color:${color};stop-opacity:0"/>
    </linearGradient>
  </defs>
  <path d="${area}" fill="url(#${gid})"/>
  <path d="${line}" fill="none" style="stroke:${color}" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"/>
  <circle cx="${lastX}" cy="${lastY}" r="5" style="fill:${color};stroke:var(--bg-secondary)" stroke-width="2.5"/>
</svg>`;
}

// ── Słupki grupowane (przychód vs koszty per miesiąc/okres) ──────────────────
// data = { labels: [...], series: [{ name, color, values: [...] }, ...] }
export function groupedBars(data, { height = 170, width = 320, yTicks = 4, fmtY } = {}) {
  const labels = data.labels || [];
  const series = data.series || [];
  const n = labels.length || 1;
  const allVals = series.flatMap(s => s.values.map(v => Number(v) || 0));
  const max = Math.max(...allVals, 1);
  const niceMax = niceCeil(max);

  const padL = 34, padR = 6, padT = 8, padB = 22;
  const plotW = width - padL - padR;
  const plotH = height - padT - padB;
  const groupW = plotW / n;
  const barGap = 3;
  const groupInnerPad = groupW * 0.22;
  const barsArea = groupW - groupInnerPad * 2;
  const barW = Math.max(4, (barsArea - barGap * (series.length - 1)) / series.length);
  const yOf = (v) => padT + plotH - (plotH * v) / niceMax;

  let grid = '';
  for (let t = 0; t <= yTicks; t++) {
    const val = (niceMax / yTicks) * t;
    const gy = yOf(val).toFixed(1);
    grid += `<line x1="${padL}" y1="${gy}" x2="${width - padR}" y2="${gy}" style="stroke:var(--border)" stroke-width="1" opacity="0.5"/>`;
    grid += `<text x="${padL - 6}" y="${(+gy + 3).toFixed(1)}" text-anchor="end" font-size="9" style="fill:var(--text-muted)">${esc(fmtY ? fmtY(val) : shortNum(val))}</text>`;
  }

  let bars = '';
  const baseY = yOf(0);
  labels.forEach((_, gi) => {
    const gx = padL + groupW * gi + groupInnerPad;
    series.forEach((s, si) => {
      const v = Number(s.values[gi]) || 0;
      const bx = gx + si * (barW + barGap);
      const by = yOf(v);
      const h = Math.max(0, baseY - by);
      const r = Math.min(4, barW / 2, h);
      bars += roundedTopRect(bx, by, barW, h, r, s.color);
    });
  });

  let xlabels = '';
  labels.forEach((lb, gi) => {
    const cx = padL + groupW * gi + groupW / 2;
    xlabels += `<text x="${cx.toFixed(1)}" y="${height - 7}" text-anchor="middle" font-size="9" style="fill:var(--text-muted)">${esc(lb)}</text>`;
  });

  return `
<svg viewBox="0 0 ${width} ${height}" width="100%" preserveAspectRatio="xMidYMid meet" role="img" aria-label="Przychód i koszty w czasie">
  ${grid}
  ${bars}
  ${xlabels}
</svg>`;
}

// ── Pierścień postępu (timer) ────────────────────────────────────────────────
// fraction 0..1. Otoczka (.timer-ring-wrap svg) obraca o -90° w CSS, więc rysujemy
// od godziny 3 — po obrocie start jest na górze.
export function progressRing(fraction, { size = 200, stroke = 14, color = 'var(--accent-blue)', track = 'var(--bg-tertiary)' } = {}) {
  const f = Math.max(0, Math.min(1, Number(fraction) || 0));
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  const cx = size / 2, cy = size / 2;
  const dash = (c * f).toFixed(2);
  return `
<svg viewBox="0 0 ${size} ${size}" role="img" aria-label="Postęp dnia">
  <circle cx="${cx}" cy="${cy}" r="${r}" fill="none" style="stroke:${track}" stroke-width="${stroke}"/>
  <circle cx="${cx}" cy="${cy}" r="${r}" fill="none" style="stroke:${color}" stroke-width="${stroke}"
    stroke-linecap="round" stroke-dasharray="${dash} ${(c - dash).toFixed(2)}"/>
</svg>`;
}

// ── pomocnicze ───────────────────────────────────────────────────────────────
function roundedTopRect(x, y, w, h, r, fill) {
  if (h <= 0) return '';
  r = Math.min(r, w / 2, h);
  return `<path d="M${x.toFixed(1)} ${(y + h).toFixed(1)} L${x.toFixed(1)} ${(y + r).toFixed(1)} Q${x.toFixed(1)} ${y.toFixed(1)} ${(x + r).toFixed(1)} ${y.toFixed(1)} L${(x + w - r).toFixed(1)} ${y.toFixed(1)} Q${(x + w).toFixed(1)} ${y.toFixed(1)} ${(x + w).toFixed(1)} ${(y + r).toFixed(1)} L${(x + w).toFixed(1)} ${(y + h).toFixed(1)} Z" style="fill:${fill}"/>`;
}

function niceCeil(v) {
  if (v <= 0) return 1;
  const mag = Math.pow(10, Math.floor(Math.log10(v)));
  const norm = v / mag;
  let step;
  if (norm <= 1) step = 1;
  else if (norm <= 2) step = 2;
  else if (norm <= 2.5) step = 2.5;
  else if (norm <= 5) step = 5;
  else step = 10;
  return step * mag;
}

function shortNum(v) {
  if (v >= 1000) return (v / 1000).toFixed(v % 1000 === 0 ? 0 : 1) + 'k';
  return String(Math.round(v));
}
