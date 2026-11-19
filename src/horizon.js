'use strict';

const TAU = Math.PI * 2;
const mod = (n, d) => ((n % d) + d) % d;
function validateHorizon(rule, name) {
  if (rule === undefined) return;
  if (!rule || !['auto', 'fixed'].includes(rule.mode)) throw new Error('Modo de nascer e pôr inválido em ' + name + '.');
  const bounds = (n, lo, hi) => Number.isFinite(n) && n >= lo && n < hi;
  if (rule.mode === 'fixed' && (!bounds(rule.rise, 0, 1) || !bounds(rule.set, 0, 1) || rule.rise === rule.set))
    throw new Error('Informe horários válidos e diferentes para nascer e pôr de ' + name + '.');
  for (const key of ['riseOffset', 'setOffset']) if (rule[key] !== undefined && !bounds(rule[key], -.5, .50000000001))
    throw new Error('O ajuste de horário de ' + name + ' precisa ficar entre −50% e 50% do dia.');
}
function wrapWindow(from, to, total) {
  if (to > from) return [[from, to]];
  return [[0, to], [from, total]].filter(([a, b]) => b > a);
}
function applyHorizon(rule, natural, total) {
  if (rule?.mode === 'fixed') {
    const from = rule.rise * total, to = rule.set * total;
    return { from, to, rises: [from], sets: [to], intervals: wrapWindow(from, to, total), horizon: 'normal', configured: true };
  }
  if (natural.horizon !== 'normal' || (!rule?.riseOffset && !rule?.setOffset)) return natural;
  const offsetRise = (rule.riseOffset || 0) * total, offsetSet = (rule.setOffset || 0) * total;
  const rises = natural.rises.map((x) => mod(x + offsetRise, total));
  const sets = natural.sets.map((x) => mod(x + offsetSet, total));
  const intervals = [];
  // Join the visible pieces that straddle midnight before adjusting endpoints.
  const runs = natural.intervals.map((x) => [...x]);
  if (runs.length > 1 && runs[0][0] === 0 && runs.at(-1)[1] === total) {
    const first = runs.shift(), last = runs.pop();
    runs.push([last[0], total + first[1]]);
  }
  for (const [a, b] of runs) {
    const aroundMidnight = runs.length === 1 && b > total;
    const start = a + (a || natural.rises.includes(0) || aroundMidnight ? offsetRise : 0);
    const finish = b + (b < total || aroundMidnight ? offsetSet : 0);
    if (finish - start >= total) return { from: null, to: null, rises: [], sets: [], intervals: [[0, total]], horizon: 'always', configured: true };
    if (finish > start) intervals.push(...wrapWindow(mod(start, total), mod(finish, total), total));
  }
  if (!intervals.length) return { from: null, to: null, rises: [], sets: [], intervals: [], horizon: 'never', configured: true };
  return { from: rises[0] ?? null, to: sets[0] ?? null, rises, sets, intervals, horizon: 'normal', configured: true };
}
function horizonAt(window, minute) {
  return window.intervals.some(([from, to]) => minute >= from && minute < to);
}
function sampledHorizon(altitude, total) {
  const intervals = [], rises = [], sets = [];
  let prev = 0, above = altitude(0) >= 0, beginning = above ? 0 : null;
  for (let i = 1; i <= 128; i++) {
    const t = i / 128, current = altitude(t) >= 0;
    if (current !== above) {
      let a = prev, b = t;
      for (let iter = 0; iter < 20; iter++) {
        const m = (a + b) / 2;
        if ((altitude(m) >= 0) === above) a = m; else b = m;
      }
      const minute = (a + b) / 2 * total;
      if (current) { rises.push(minute); beginning = minute; }
      else { sets.push(minute); intervals.push([beginning, minute]); beginning = null; }
      above = current;
    }
    prev = t;
  }
  if (beginning !== null) intervals.push([beginning, total]);
  const horizon = !intervals.length ? 'never' : !rises.length && !sets.length ? 'always' : 'normal';
  return { horizon, intervals, rises, sets, from: rises[0] ?? null, to: sets[0] ?? null };
}
function parseClockTime(text, clock) {
  const m = /^(\d{1,2}):(\d{2})$/.exec(text.trim());
  return m && Number(m[1]) < clock.hours && Number(m[2]) < clock.minutes ? (Number(m[1]) * clock.minutes + Number(m[2])) / (clock.hours * clock.minutes) : NaN;
}
function referenceAngle(ref, fraction) { return ref.ra + TAU * (fraction - .5); }

module.exports = { validateHorizon, wrapWindow, applyHorizon, horizonAt, sampledHorizon, parseClockTime, referenceAngle };
