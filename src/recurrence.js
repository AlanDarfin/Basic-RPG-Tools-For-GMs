'use strict';
const UNITS = [['day', 'Dias'], ['week', 'Semanas'], ['month', 'Meses'], ['year', 'Anos']];
const TYPES = [['weekday', 'Dia da semana'], ['moon', 'Fase de uma lua'], ['season', 'Estação'], ['month', 'Mês'],
  ['day', 'Dia do mês'], ['event', 'Dias após outro evento']];
const PHASE_NAMES = ['Nova', 'Crescente', 'Quarto crescente', 'Gibosa crescente', 'Cheia', 'Gibosa minguante', 'Quarto minguante', 'Minguante'];
const int = (n, min, max) => Number.isInteger(n) && n >= min && n <= max;
function check(ok, text) { if (!ok) throw new Error(text); }
function validatePattern(c, p) {
  check(p && UNITS.some(([v]) => v === p.unit) && int(p.every, 1, 10000) && int(p.duration, 1, 366),
    'Informe um intervalo de 1 a 10.000 e uma duração de 1 a 366 dias.');
  check(['all', 'any'].includes(p.match) && Array.isArray(p.rules) && p.rules.length <= 12, 'Condições inválidas (limite de 12).');
  for (const r of p.rules) {
    const type = r?.type, v = r?.value;
    const valid = type === 'weekday' ? c.week.includes(v) || c.months.some((m) => m.week?.includes(v)) :
      type === 'moon' ? c.moons.some((m) => m.id === v && !m.hidden) && int(r.phase, 0, 7) :
      type === 'season' ? c.seasons.some((s) => s.id === v) :
      type === 'month' ? c.months.some((m) => m.id === v) :
      type === 'day' ? int(v, 1, 340) :
      type === 'event' ? c.events.some((e) => e.id === v && e.repeat !== 'undated' && e.repeat !== 'pattern') && int(r.after, 0, 5000) : false;
    check(valid, 'Uma condição aponta para um dia, astro, estação ou evento indisponível.');
  }
}
function patternStart(e, event, d, pos = e.epoch(d)) {
  const p = event.pattern, a = event.start;
  const from = e.epoch(a), days = pos - from;
  if (days < 0) return false;
  let distance;
  if (p.unit === 'day') distance = days;
  else if (p.unit === 'week') {
    const x = e.regularEpoch(a), y = e.regularEpoch(d);
    if (x === null || y === null || (y - x) % e.c.week.length) return false;
    distance = (y - x) / e.c.week.length;
  } else if (p.unit === 'month') {
    if (d.day !== a.day) return false;
    distance = e.monthCountBefore(d) - e.monthCountBefore(a);
  } else {
    if (d.month !== a.month || d.day !== a.day) return false;
    distance = d.year - a.year;
  }
  if (distance < 0 || distance % p.every) return false;
  const match = (r) => {
    switch (r.type) {
      case 'weekday': return e.dayMeta(d).weekday === r.value;
      case 'moon': return e.moons(d, .5).some((m) => m.id === r.value && m.index === r.phase);
      case 'season': return e.season(d)?.id === r.value;
      case 'month': return d.month === r.value;
      case 'day': return d.day === r.value;
      case 'event': {
        const ref = e.c.events.find((x) => x.id === r.value);
        return !!ref && pos >= r.after && e.eventStartsOn(ref, e.fromEpoch(pos - r.after));
      }
      default: return false;
    }
  };
  return !p.rules.length || (p.match === 'all' ? p.rules.every(match) : p.rules.some(match));
}
function patternOn(e, event, d) {
  const pos = e.epoch(d), lo = e.epoch(event.start);
  for (let at = pos; at >= Math.max(lo, pos - event.pattern.duration + 1); at--)
    if (patternStart(e, event, at === pos ? d : e.fromEpoch(at), at)) return true;
  return false;
}
function previewPattern(e, event, since, bound, count = 10) {
  const first = Math.max(e.epoch(event.start), e.epoch(since)), stop = Math.min(bound, first + 5000);
  const items = [];
  for (let at = first; at < stop && items.length < count; at++) {
    const d = e.fromEpoch(at);
    if (patternStart(e, event, d, at)) items.push(d);
  }
  return items;
}
module.exports = { UNITS, TYPES, PHASE_NAMES, validatePattern, patternOn, patternStart, previewPattern };
