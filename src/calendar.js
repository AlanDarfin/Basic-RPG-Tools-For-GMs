'use strict';

const { emptySky, validateSky } = require('./sky');
const { validateEclipseOrbit } = require('./eclipse');
const { validateHorizon } = require('./horizon');
const { patternStart, patternOn, validatePattern } = require('./recurrence');
const { validateWeather, validateSeasonClimate } = require('./weather');
const { civilDay, periodicPhase } = require('./seasons');

const MAX_YEAR = 100000;
const DAYS = ['Segunda', 'Terça', 'Quarta', 'Quinta', 'Sexta', 'Sábado', 'Domingo'];
const PHASES = ['Nova', 'Crescente', 'Quarto crescente', 'Gibosa crescente', 'Cheia', 'Gibosa minguante', 'Quarto minguante', 'Minguante'];
const ICONS = ['🌑', '🌒', '🌓', '🌔', '🌕', '🌖', '🌗', '🌘'];
const mod = (n, size) => ((n % size) + size) % size;
const copy = (x) => JSON.parse(JSON.stringify(x));
let seq = 0;
const uid = (prefix = 'id') => `${prefix}-${Date.now().toString(36)}-${(++seq).toString(36)}-${Math.random().toString(36).slice(2, 7)}`;

function assert(predicate, message) {
  if (!predicate) throw new Error(message);
}
function integer(n, lo, hi, title) {
  assert(Number.isInteger(n) && n >= lo && n <= hi, `${title}: use um inteiro entre ${lo} e ${hi}.`);
  return n;
}
function number(n, lo, hi, title) {
  assert(Number.isFinite(n) && n >= lo && n <= hi, `${title}: use um número entre ${lo} e ${hi}.`);
  return n;
}
function string(v, max, title, allowBlank = false) {
  assert(typeof v === 'string' && v.length <= max && (allowBlank || v.trim()), `${title}: texto inválido.`);
  return v.trim();
}
function array(v, max, title, min = 0) {
  assert(Array.isArray(v) && v.length >= min && v.length <= max, `${title}: use entre ${min} e ${max} itens.`);
  return v;
}
function unique(v, title) {
  assert(new Set(v).size === v.length, `${title}: não pode haver duplicatas.`);
}
const fold = (s) => s.normalize('NFKD').replace(/\p{Diacritic}/gu, '').trim().toLocaleLowerCase();

function newCalendar(name = 'Meu mundo') {
  const months = ['Alvor', 'Ventaris', 'Maré', 'Brumal'].map((name, i) => ({ id: uid('mes'), name, length: 30 + i, intercalary: false }));
  return {
    id: uid('cal'), name, description: '', week: [...DAYS], firstWeekday: 0, weekOverflow: true,
    months, leapDays: [], moons: [], seasons: [], seasonMode: 'date', seasonOffset: 0, eras: [],
    clock: { hours: 24, minutes: 60 }, current: { year: 1, month: months[0].id, day: 1, hour: 0, minute: 0 },
    events: [], sky: emptySky(months.reduce((n, item) => n + item.length, 0)),
  };
}
function countEvery(y, every, offset) {
  return Math.floor((y - 1 - offset) / every) - Math.floor((-offset) / every);
}
function leapActive(leap, year) {
  const d = year - leap.offset;
  return mod(d, leap.every) === 0 && (!leap.except || mod(d, leap.except) !== 0 || (leap.also && mod(d, leap.also) === 0));
}
function monthPresent(m, year) { return mod(year - (m.offset || 0), m.every || 1) === 0; }
function overlapRule(a, u, b, v) {
  let x = a, y = b, i = 1, j = 0;
  while (y) { const q = Math.floor(x / y); [x, y] = [y, x - q * y]; [i, j] = [j, i - q * j]; }
  if ((v - u) % x) return null;
  const span = a * (b / x);
  return { span, offset: mod(u + a * mod(((v - u) / x) * i, b / x), span) };
}
class CalendarEngine {
  constructor(c, derived = []) {
    this.c = c;
    this.firstYear = c.firstYear ?? 1;
    this.events = derived.length ? [...c.events, ...derived] : c.events;
    this.monthIds = new Map(c.months.map((m, i) => [m.id, i]));
    this.extras = c.months.map(() => []);
    for (const l of c.leapDays) this.extras[this.monthIndex(l.month)].push(l);
    const annual = c.months.filter((m) => (m.every || 1) === 1);
    this.recurrent = c.months.filter((m) => (m.every || 1) > 1);
    this.baseDays = annual.reduce((n, m) => n + m.length, 0);
    this.baseWeekDays = annual.reduce((n, m) => n + (m.intercalary ? 0 : m.length), 0);
    this.leapRules = c.leapDays.flatMap((l) => {
      const month = c.months[this.monthIndex(l.month)], weekly = !l.intercalary && !month.intercalary;
      return [[l.every, 1], [l.except, -1], [l.also, 1]].filter(([n]) => n).flatMap(([n, sign]) => {
        const rule = overlapRule(month.every || 1, month.offset || 0, n, l.offset);
        return rule ? [{ ...rule, sign, weekly }] : [];
      });
    });
    this.lastYear = null;
  }
  monthIndex(id) {
    const i = this.monthIds.get(id);
    assert(i !== undefined, 'O mês dessa data não existe.');
    return i;
  }
  yearStart(year, weekly = false) {
    const base = (year - this.firstYear) * (weekly ? this.baseWeekDays : this.baseDays);
    const extra = this.recurrent.reduce((sum, m) => sum + (!weekly || !m.intercalary ? m.length * (countEvery(year, m.every, m.offset || 0) - countEvery(this.firstYear, m.every, m.offset || 0)) : 0), 0);
    return this.leapRules.reduce((n, l) => n + (!weekly || l.weekly ? l.sign * (countEvery(year, l.span, l.offset) - countEvery(this.firstYear, l.span, l.offset)) : 0), base + extra);
  }
  yearInfo(year) {
    integer(year, this.firstYear, MAX_YEAR, 'Ano');
    if (this.lastYear?.year === year) return this.lastYear;
    let total = 0, regular = 0;
    const months = this.c.months.map((m, i) => {
      const start = total, regularStart = regular;
      if (!monthPresent(m, year)) return { m, start, regularStart, extras: [], specialDays: new Map(), length: 0 };
      const extras = this.extras[i].filter((l) => leapActive(l, year));
      total += m.length + extras.length;
      regular += m.intercalary ? 0 : m.length + extras.filter((l) => !l.intercalary).length;
      const specialDays = new Map();
      const ordered = extras.slice().sort((a, b) => (a.after ?? m.length) - (b.after ?? m.length));
      let removed = 0;
      ordered.forEach((item, j) => {
        const day = (item.after ?? m.length) + j + 1;
        if (item.intercalary) removed++;
        specialDays.set(day, { item, intercalaryBefore: removed });
      });
      return { m, start, regularStart, extras, specialDays, length: m.length + extras.length };
    });
    return this.lastYear = { year, months, total };
  }
  monthLength(year, month) { return this.yearInfo(year).months[this.monthIndex(month)].length; }
  check(d) {
    assert(d && typeof d === 'object', 'Data inválida.');
    integer(d.year, this.firstYear, MAX_YEAR, 'Ano');
    const info = this.yearInfo(d.year).months[this.monthIndex(d.month)];
    assert(info.length, 'Esse mês não existe neste ano: ' + info.m.name + '.');
    integer(d.day, 1, info.length, `Dia em ${info.m.name}`);
    return d;
  }
  epoch(d) {
    this.check(d);
    return this.yearStart(d.year) + this.yearInfo(d.year).months[this.monthIndex(d.month)].start + d.day - 1;
  }
  fromEpoch(e) {
    integer(e, 0, this.yearStart(MAX_YEAR + 1) - 1, 'Posição no calendário');
    let lo = this.firstYear, hi = MAX_YEAR + 1;
    while (hi - lo > 1) {
      const mid = Math.floor((lo + hi) / 2);
      if (this.yearStart(mid) <= e) lo = mid; else hi = mid;
    }
    const ordinal = e - this.yearStart(lo);
    const m = this.yearInfo(lo).months.find((x) => x.length && ordinal < x.start + x.length);
    return { year: lo, month: m.m.id, day: ordinal - m.start + 1 };
  }
  shift(d, days) { return this.fromEpoch(this.epoch(d) + days); }
  activeMonths(year) { return this.yearInfo(year).months.filter((x) => x.length > 0).map((x) => x.m); }
  monthCountBefore(d) {
    return this.c.months.reduce((n, m, i) => n + countEvery(d.year, m.every || 1, m.offset || 0) - countEvery(this.firstYear, m.every || 1, m.offset || 0) +
      Number(i < this.monthIndex(d.month) && monthPresent(m, d.year)), 0);
  }
  monthShift(d, amount) {
    if (!amount) return { ...d };
    const size = this.c.months.length, dir = Math.sign(amount);
    let i = (d.year - 1) * size + this.monthIndex(d.month), remaining = Math.abs(amount);
    while (remaining) {
      i += dir;
      const year = 1 + Math.floor(i / size);
      integer(year, this.firstYear, MAX_YEAR, 'Ano');
      const month = this.c.months[mod(i, size)].id, length = this.monthLength(year, month);
      if (length && --remaining === 0) return { year, month, day: Math.min(d.day, length) };
    }
  }
  weekdays(month) { return this.c.months[this.monthIndex(month)].week || this.c.week; }
  dayMeta(d) {
    this.check(d);
    const info = this.yearInfo(d.year).months[this.monthIndex(d.month)];
    const special = info.specialDays.get(d.day)?.item ?? null;
    const within = this.weekSlot(info, d.day);
    if (within === null) return { special, weekday: null, index: null };
    const week = this.weekdays(d.month);
    const idx = mod(this.c.firstWeekday + within + (this.c.weekOverflow && !info.m.week ? this.yearStart(d.year, true) + info.regularStart : 0), week.length);
    return { special, weekday: week[idx], index: idx };
  }
  weekSlot(info, day) {
    if (info.m.intercalary || info.specialDays.get(day)?.item.intercalary) return null;
    let omitted = 0;
    for (const [at, row] of info.specialDays) {
      if (at >= day) break;
      omitted = row.intercalaryBefore;
    }
    return day - 1 - omitted;
  }
  regularEpoch(d) {
    const info = this.yearInfo(d.year).months[this.monthIndex(d.month)];
    const within = this.weekSlot(info, d.day);
    return within === null ? null : this.yearStart(d.year, true) + info.regularStart + within;
  }
  moons(d, fraction = 0) {
    const epoch = this.epoch(d) + fraction;
    return this.c.moons.filter((m) => !m.hidden).map((m) => {
      const gran = m.granularity || 8;
      const round = { floor: Math.floor, ceil: Math.ceil, round: Math.round }[m.rounding || 'round'];
      const degrees = mod(epoch - m.offset, m.period) / m.period;
      const exact = mod(round(degrees * gran), gran);
      const p = exact * 8 / gran;
      const index = Number.isInteger(p) ? p : Math.floor(p / 2) * 2 + 1;
      return { ...m, phase: PHASES[index], icon: ICONS[index], index, illumination: (1 - Math.cos(degrees * Math.PI * 2)) / 2, waxing: degrees < .5 };
    });
  }
  season(d) {
    if (!this.c.seasons.length) return null;
    if (this.c.seasonMode === 'periodic') {
      const day = this.epoch(d), { index, season, startOf } = periodicPhase(this.c, day);
      return { ...season, dayOfSeason: day - civilDay(startOf(index)) + 1 };
    }
    const value = this.epoch(d);
    const candidates = this.c.seasons.flatMap((s) => {
      const current = { year: d.year, month: s.month, day: s.day };
      const e = this.epoch(current);
      if (e <= value) return [{ s, epoch: e }];
      if (d.year === this.firstYear) return [];
      return [{ s, epoch: this.epoch({ ...current, year: d.year - 1 }) }];
    }).sort((a, b) => b.epoch - a.epoch);
    return candidates.length ? { ...candidates[0].s, dayOfSeason: value - candidates[0].epoch + 1 } : null;
  }
  yearLabel(year, date) {
    const named = this.c.namedYears?.find((x) => x.year === year);
    if (named) return named.name;
    const pos = date ? this.epoch(date) : this.yearStart(year), start = (era) => era.month ?
      this.epoch({ year: era.start, month: era.month, day: era.day }) : this.yearStart(era.start);
    const era = this.c.eras.filter((e) => e.start <= year).map((e) => [e, start(e)])
      .filter(([, at]) => at <= pos).sort((a, b) => b[1] - a[1])[0]?.[0];
    return era ? `${era.reset ? year - era.start + 1 : year} ${era.name}` : String(year);
  }
  format(d) {
    const fields = { dia: d.day, mes: this.c.months[this.monthIndex(d.month)].name, ano: this.yearLabel(d.year, d), numero: d.year };
    return (this.c.dateFormat || '{dia} de {mes}, ano {ano}').replace(/\{(dia|mes|ano|numero)\}/g, (_, key) => fields[key]);
  }
  cyclesOn(d) {
    const serials = { day: this.epoch(d), month: this.monthCountBefore(d), year: d.year - this.firstYear };
    return (this.c.cycles || []).map((c) => ({ name: c.name,
      label: c.labels[mod(Math.floor((serials[c.unit] - c.offset) / c.span), c.labels.length)] }));
  }
  eventStartsOn(event, d) {
    if (event.repeat === 'pattern') return patternStart(this, event, d);
    if (event.repeat === 'undated') return false;
    if (event.repeat === 'season') return this.eventOn(event, d);
    if (event.repeat === 'year') return d.year >= event.start.year && d.month === event.start.month && d.day === event.start.day;
    return sameDate(event.start, d);
  }
  eventOn(event, d) {
    if (event.repeat === 'undated') return false;
    if (event.repeat === 'pattern') return patternOn(this, event, d);
    if (event.repeat === 'season') {
      const at = this.season(d);
      return at?.id === event.seasonId && at.dayOfSeason === 1;
    }
    const pos = this.epoch(d);
    if (event.repeat === 'none') return this.epoch(event.start) <= pos && pos <= this.epoch(event.end || event.start);
    const seasonSpan = event.end ? event.end.year - event.start.year : 0;
    for (const startYear of [d.year, d.year - 1]) {
      if (startYear < event.start.year || startYear + seasonSpan > MAX_YEAR) continue;
      try {
        const a = this.epoch({ ...event.start, year: startYear });
        const b = event.end ? this.epoch({ ...event.end, year: startYear + seasonSpan }) : a;
        if (a <= pos && pos <= b) return true;
      } catch { /* A date may exist only in leap years. */ }
    }
    return false;
  }
  eventsOn(d) { return this.events.filter((e) => this.eventOn(e, d)); }
  firstOccurrenceInYear(event, year) {
    const first = this.yearStart(year), end = this.yearStart(year + 1);
    if (event.repeat === 'undated') return null;
    if (event.repeat === 'pattern') {
      for (let at = Math.max(first, this.epoch(event.start)); at < end; at++) {
        const d = this.fromEpoch(at);
        if (patternOn(this, event, d)) return d;
      }
      return null;
    }
    if (event.repeat === 'none') {
      const starts = Math.max(first, this.epoch(event.start)), until = this.epoch(event.end || event.start);
      return starts < end && starts <= until ? this.fromEpoch(starts) : null;
    }
    if (event.repeat === 'year') {
      const span = event.end ? event.end.year - event.start.year : 0;
      const days = [];
      for (const y of [year - 1, year]) {
        if (y < event.start.year || y + span > MAX_YEAR) continue;
        try {
          const a = this.epoch({ ...event.start, year: y });
          const b = event.end ? this.epoch({ ...event.end, year: y + span }) : a;
          const starts = Math.max(first, a);
          if (starts < end && starts <= b) days.push(starts);
        } catch { /* Skip dates absent in this year. */ }
      }
      return days.length ? this.fromEpoch(Math.min(...days)) : null;
    }
    const s = this.c.seasons.find((item) => item.id === event.seasonId);
    if (!s) return null;
    if (this.c.seasonMode === 'date') return { year, month: s.month, day: s.day };
    const cycle = this.c.seasons.reduce((n, item) => n + item.duration, 0);
    const index = this.c.seasons.indexOf(s);
    const start = this.c.seasonOffset + this.c.seasons.slice(0, index).reduce((n, item) => n + item.duration, 0);
    // Allow a fractional start first detected on the following civil day.
    let e = Math.max(first, civilDay(start + (Math.ceil((first - start) / cycle) - 1) * cycle));
    const next = Math.max(first, civilDay(start + Math.ceil((first - start) / cycle) * cycle));
    if (e >= end || !this.eventOn(event, this.fromEpoch(e))) e = next;
    return e < end && this.eventOn(event, this.fromEpoch(e)) ? this.fromEpoch(e) : null;
  }
  rows(year, month) {
    const rows = [], width = this.weekdays(month).length;
    let row = null;
    for (let day = 1; day <= this.monthLength(year, month); day++) {
      const d = { year, month, day }, info = this.dayMeta(d);
      if (info.index === null) {
        row = null;
        rows.push({ special: d });
      } else {
        if (!row || info.index === 0) {
          row = Array(width).fill(null);
          rows.push({ days: row });
        }
        row[info.index] = d;
      }
    }
    return rows;
  }
}

function validateCalendar(c) {
  assert(c && typeof c === 'object', 'Calendário inválido.');
  string(c.id, 100, 'ID');
  string(c.name, 100, 'Nome do calendário');
  string(c.description, 2000, 'Descrição', true);
  array(c.week, 24, 'Dias da semana', 1).forEach((s) => string(s, 50, 'Dia da semana'));
  unique(c.week.map(fold), 'Nomes dos dias da semana');
  integer(c.firstWeekday, 0, c.week.length - 1, 'Primeiro dia da semana');
  assert(typeof c.weekOverflow === 'boolean', 'Modo de continuidade da semana inválido.');
  array(c.months, 100, 'Meses', 1).forEach((m) => {
    string(m.id, 100, 'ID do mês'); string(m.name, 60, 'Nome do mês'); integer(m.length, 1, 240, 'Dias do mês');
    if (m.every !== undefined) integer(m.every, 1, MAX_YEAR, 'Intervalo do mês');
    if (m.offset !== undefined) integer(m.offset, -MAX_YEAR, MAX_YEAR, 'Deslocamento do mês');
    if (m.week !== undefined) {
      assert(!m.intercalary, 'Um mês fora da semana não pode ter semana própria.');
      array(m.week, 24, 'Dias da semana do mês', 1).forEach((d) => string(d, 50, 'Dia da semana'));
      unique(m.week.map(fold), 'Dias da semana do mês');
    }
  });
  assert(c.months.some((m) => (m.every || 1) === 1), 'A recorrência precisa deixar pelo menos um mês em todos os anos.');
  unique(c.months.map((x) => x.id), 'IDs dos meses');
  unique(c.months.map((x) => fold(x.name)), 'Nomes dos meses');
  array(c.leapDays, 100, 'Dias especiais').forEach((l) => {
    string(l.id, 100, 'ID do dia especial'); string(l.name, 60, 'Nome do dia especial');
    const m = c.months.find((m) => m.id === l.month);
    assert(m, `O mês de ${l.name} não existe.`);
    if (l.after !== undefined) integer(l.after, 0, m.length, 'Posição do dia especial');
    integer(l.every, 1, MAX_YEAR, 'Intervalo do dia especial');
    integer(l.offset, -MAX_YEAR, MAX_YEAR, 'Deslocamento do dia especial');
    integer(l.except, 0, MAX_YEAR, 'Exceção');
    integer(l.also, 0, MAX_YEAR, 'Restaurar');
    assert(!l.except || l.except % l.every === 0, 'A exceção deve ser múltipla do intervalo.');
    assert(!l.also || (l.except && l.also % l.except === 0), 'A restauração deve ser múltipla da exceção.');
  });
  unique(c.leapDays.map((l) => l.id), 'IDs de dias especiais');
  array(c.moons, 25, 'Luas').forEach((m) => {
    string(m.id, 100, 'ID lunar'); string(m.name, 60, 'Nome da lua');
    number(m.period, 1, MAX_YEAR, 'Período lunar'); number(m.offset, -MAX_YEAR, MAX_YEAR, 'Deslocamento lunar');
    assert([4, 8, 16, 24, 32, 40, 48, 56, 64].includes(m.granularity || 8), 'Granularidade lunar inválida.');
    assert(['round', 'floor', 'ceil'].includes(m.rounding || 'round'), 'Arredondamento lunar inválido.');
    validateEclipseOrbit(m.eclipse);
    validateHorizon(m.riseSet, m.name);
  });
  unique(c.moons.map((m) => m.id), 'IDs lunares');
  if (c.firstYear !== undefined) integer(c.firstYear, -MAX_YEAR, 1, 'Primeiro ano');
  const e = new CalendarEngine(c);
  if (c.sky !== undefined) validateSky(c.sky);
  assert(c.seasonMode === 'date' || c.seasonMode === 'periodic', 'Tipo de estação inválido.');
  number(c.seasonOffset, -MAX_YEAR, MAX_YEAR, 'Deslocamento das estações');
  const seasons = array(c.seasons, 50, 'Estações');
  seasons.forEach((s) => {
    string(s.id, 100, 'ID da estação'); string(s.name, 60, 'Nome da estação'); validateColor(s.color);
    validateSeasonClimate(s.climate, s.name);
    if (c.seasonMode === 'periodic') number(s.duration, 1, MAX_YEAR, 'Duração da estação');
    else {
      const month = c.months[e.monthIndex(s.month)];
      assert((month.every || 1) === 1, 'Uma estação por data precisa começar em um mês que exista todos os anos.');
      integer(s.day, 1, month.length, 'Dia inicial da estação');
    }
  });
  unique(seasons.map((s) => s.id), 'IDs das estações');
  validateWeather(c.weather, seasons);
  if (c.seasonMode === 'date') unique(seasons.map((s) => `${s.month}/${s.day}`), 'Datas de estação');
  array(c.eras, 100, 'Eras').forEach((era) => {
    string(era.name, 60, 'Nome da era'); integer(era.start, e.firstYear, MAX_YEAR, 'Ano da era');
    if (era.month !== undefined) e.check({ year: era.start, month: era.month, day: era.day });
  });
  unique(c.eras.map((x) => x.month ? e.epoch({ year: x.start, month: x.month, day: x.day }) : e.yearStart(x.start)), 'Datas de início das eras');
  assert(c.clock && typeof c.clock === 'object', 'Relógio inválido.');
  integer(c.clock.hours, 1, 100, 'Horas por dia'); integer(c.clock.minutes, 1, 100, 'Minutos por hora');
  if (c.realDayHours !== undefined) number(c.realDayHours, .01, 8760, 'Horas reais por dia do mundo');
  if (c.clockLink !== undefined) {
    assert(c.clockLink && c.clockLink.id !== c.id, 'Um calendário não pode acompanhar a si mesmo.');
    string(c.clockLink.id, 100, 'Calendário de referência');
    number(c.clockLink.offset, -1000000, 1000000, 'Diferença entre calendários');
  }
  if (c.dateFormat !== undefined) string(c.dateFormat, 100, 'Formato de data', true);
  if (c.namedYears !== undefined) {
    array(c.namedYears, 200, 'Anos nomeados').forEach((x) => { integer(x.year, e.firstYear, MAX_YEAR, 'Ano'); string(x.name, 80, 'Nome do ano'); });
    unique(c.namedYears.map((x) => x.year), 'Anos nomeados');
  }
  if (c.cycles !== undefined) array(c.cycles, 12, 'Ciclos').forEach((x) => {
    string(x.name, 60, 'Ciclo'); assert(['day', 'month', 'year'].includes(x.unit), 'Unidade do ciclo inválida.');
    integer(x.span, 1, 100000, 'Duração do ciclo'); integer(x.offset, -100000, 100000, 'Deslocamento do ciclo');
    array(x.labels, 100, 'Rótulos do ciclo', 1).forEach((l) => string(l, 60, 'Rótulo do ciclo'));
  });
  if (c.clockSync !== undefined) {
    assert(c.clockSync && ['manual', 'real'].includes(c.clockSync.mode), 'Modo do relógio inválido.');
    integer(c.clockSync.since, 0, Number.MAX_SAFE_INTEGER, 'Âncora do relógio');
  }
  e.check(c.current);
  integer(c.current.hour, 0, c.clock.hours - 1, 'Hora atual');
  integer(c.current.minute, 0, c.clock.minutes - 1, 'Minuto atual');
  if (c.dayNotices !== undefined) assert(typeof c.dayNotices === 'boolean', 'Opção de avisos inválida.');
  if (c.noteSources !== undefined) {
    const n = c.noteSources;
    assert(n && ['enabled', 'inline', 'parseTitle'].every((key) => typeof n[key] === 'boolean'), 'Configuração de leitura de notas inválida.');
    string(n.folder, 500, 'Pasta de notas', true);
  }
  if (c.eventCategories !== undefined) {
    array(c.eventCategories, 100, 'Categorias').forEach((x) => {
      string(x.name, 60, 'Nome da categoria'); validateColor(x.color);
      assert(typeof x.hidden === 'boolean', 'Visibilidade de categoria inválida.');
    });
    unique(c.eventCategories.map((x) => fold(x.name)), 'Nomes das categorias');
  }
  array(c.events, 5000, 'Eventos').forEach((event) => validateEvent(c, e, event));
  unique(c.events.map((event) => event.id), 'IDs de evento');
  return c;
}
function validateColor(s) { assert(typeof s === 'string' && /^#[a-f0-9]{6}$/i.test(s), 'Cor inválida.'); }
function validateEvent(c, e, event) {
  string(event.id, 100, 'ID de evento'); string(event.title, 140, 'Título do evento');
  string(event.description, 8000, 'Descrição do evento', true);
  string(event.note, 1000, 'Nota vinculada', true); string(event.category, 60, 'Categoria', true);
  validateColor(event.color);
  assert(['none', 'year', 'season', 'pattern', 'undated'].includes(event.repeat), 'Recorrência inválida.');
  if (event.repeat === 'undated') return;
  
  if (event.repeat === 'pattern') {
    e.check(event.start); validatePattern(c, event.pattern);
    assert(event.pattern.unit !== 'week' || e.regularEpoch(event.start) !== null, 'Recorrência semanal precisa começar em um dia de semana.');
    assert(!event.pattern.rules.some((rule) => rule.type === 'event' && rule.value === event.id), 'Um evento não pode referenciar a si mesmo.');
    return;
  }
  if (event.repeat === 'season') assert(c.seasons.some((s) => s.id === event.seasonId), 'A estação desse evento não existe.');
  else {
    const start = e.epoch(event.start);
    if (event.end) {
      assert(e.epoch(event.end) >= start, 'O fim do evento não pode ser anterior ao início.');
      if (event.repeat === 'year') assert(event.end.year - event.start.year <= 1, 'Um evento anual pode cruzar no máximo uma virada de ano.');
    }
  }
}
function allWeekdays(c) { return [...new Set([...c.week, ...c.months.flatMap((m) => m.week || [])])]; }
function sameDate(a, b) { return a.year === b.year && a.month === b.month && a.day === b.day; }
function clockText(d) { return [d.hour, d.minute].map((n) => String(n).padStart(2, '0')).join(':'); }
module.exports = { CalendarEngine, MAX_YEAR, DAYS, assert, copy, uid, fold, newCalendar, validateCalendar, allWeekdays, sameDate, clockText };
