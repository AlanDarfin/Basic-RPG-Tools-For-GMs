'use strict';

const { emptySky, validateSky } = require('./sky');

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
function leapCount(leap, y) {
  return countEvery(y, leap.every, leap.offset) - (leap.except ? countEvery(y, leap.except, leap.offset) : 0)
    + (leap.also ? countEvery(y, leap.also, leap.offset) : 0);
}
function leapActive(leap, year) {
  const d = year - leap.offset;
  return mod(d, leap.every) === 0 && (!leap.except || mod(d, leap.except) !== 0 || (leap.also && mod(d, leap.also) === 0));
}
class CalendarEngine {
  constructor(c) {
    this.c = c;
    this.monthIds = new Map(c.months.map((m, i) => [m.id, i]));
    this.extras = c.months.map(() => []);
    for (const l of c.leapDays) this.extras[this.monthIndex(l.month)].push(l);
    this.baseDays = c.months.reduce((n, m) => n + m.length, 0);
    this.baseWeekDays = c.months.reduce((n, m) => n + (m.intercalary ? 0 : m.length), 0);
    this.lastYear = null;
  }
  monthIndex(id) {
    const i = this.monthIds.get(id);
    assert(i !== undefined, 'O mês dessa data não existe.');
    return i;
  }
  yearStart(year, weekly = false) {
    const base = (year - 1) * (weekly ? this.baseWeekDays : this.baseDays);
    return this.c.leapDays.reduce((n, l) => n + (!weekly || (!l.intercalary && !this.c.months[this.monthIndex(l.month)].intercalary) ? leapCount(l, year) : 0), base);
  }
  yearInfo(year) {
    integer(year, 1, MAX_YEAR, 'Ano');
    if (this.lastYear?.year === year) return this.lastYear;
    let total = 0, regular = 0;
    const months = this.c.months.map((m, i) => {
      const extras = this.extras[i].filter((l) => leapActive(l, year));
      const start = total, regularStart = regular;
      total += m.length + extras.length;
      regular += m.intercalary ? 0 : m.length + extras.filter((l) => !l.intercalary).length;
      return { m, start, regularStart, extras, length: m.length + extras.length };
    });
    return this.lastYear = { year, months, total };
  }
  monthLength(year, month) { return this.yearInfo(year).months[this.monthIndex(month)].length; }
  check(d) {
    assert(d && typeof d === 'object', 'Data inválida.');
    integer(d.year, 1, MAX_YEAR, 'Ano');
    const info = this.yearInfo(d.year).months[this.monthIndex(d.month)];
    integer(d.day, 1, info.length, `Dia em ${info.m.name}`);
    return d;
  }
  epoch(d) {
    this.check(d);
    return this.yearStart(d.year) + this.yearInfo(d.year).months[this.monthIndex(d.month)].start + d.day - 1;
  }
  fromEpoch(e) {
    integer(e, 0, this.yearStart(MAX_YEAR + 1) - 1, 'Posição no calendário');
    let lo = 1, hi = MAX_YEAR + 1;
    while (hi - lo > 1) {
      const mid = Math.floor((lo + hi) / 2);
      if (this.yearStart(mid) <= e) lo = mid; else hi = mid;
    }
    const ordinal = e - this.yearStart(lo);
    const m = this.yearInfo(lo).months.find((x) => ordinal < x.start + x.length);
    return { year: lo, month: m.m.id, day: ordinal - m.start + 1 };
  }
  shift(d, days) { return this.fromEpoch(this.epoch(d) + days); }
  monthShift(d, amount) {
    const i = (d.year - 1) * this.c.months.length + this.monthIndex(d.month) + amount;
    const year = 1 + Math.floor(i / this.c.months.length);
    integer(year, 1, MAX_YEAR, 'Ano');
    const month = this.c.months[mod(i, this.c.months.length)].id;
    return { year, month, day: Math.min(d.day, this.monthLength(year, month)) };
  }
  dayMeta(d) {
    this.check(d);
    const info = this.yearInfo(d.year).months[this.monthIndex(d.month)];
    const extraIndex = d.day - info.m.length - 1;
    const special = extraIndex >= 0 ? info.extras[extraIndex] : null;
    if (info.m.intercalary || special?.intercalary) return { special, weekday: null, index: null };
    const within = extraIndex < 0 ? d.day - 1 : info.m.length + info.extras.slice(0, extraIndex).filter((l) => !l.intercalary).length;
    const idx = mod(this.c.firstWeekday + within + (this.c.weekOverflow ? this.yearStart(d.year, true) + info.regularStart : 0), this.c.week.length);
    return { special, weekday: this.c.week[idx], index: idx };
  }
  moons(d) {
    const epoch = this.epoch(d);
    return this.c.moons.filter((m) => !m.hidden).map((m) => {
      const gran = m.granularity || 8;
      const round = { floor: Math.floor, ceil: Math.ceil, round: Math.round }[m.rounding || 'round'];
      const exact = mod(round(mod(epoch - m.offset, m.period) / m.period * gran), gran);
      const p = exact * 8 / gran;
      const index = Number.isInteger(p) ? p : Math.floor(p / 2) * 2 + 1;
      return { ...m, phase: PHASES[index], icon: ICONS[index], index };
    });
  }
  season(d) {
    if (!this.c.seasons.length) return null;
    if (this.c.seasonMode === 'periodic') {
      const span = this.c.seasons.reduce((n, s) => n + s.duration, 0);
      let pos = mod(this.epoch(d) - this.c.seasonOffset, span);
      for (const s of this.c.seasons) {
        if (pos < s.duration) return { ...s, dayOfSeason: Math.floor(pos) + 1 };
        pos -= s.duration;
      }
      return null;
    }
    const value = this.epoch(d);
    const candidates = this.c.seasons.flatMap((s) => {
      const current = { year: d.year, month: s.month, day: s.day };
      const e = this.epoch(current);
      if (e <= value) return [{ s, epoch: e }];
      if (d.year === 1) return [];
      return [{ s, epoch: this.epoch({ ...current, year: d.year - 1 }) }];
    }).sort((a, b) => b.epoch - a.epoch);
    return candidates.length ? { ...candidates[0].s, dayOfSeason: value - candidates[0].epoch + 1 } : null;
  }
  yearLabel(year) {
    const era = this.c.eras.filter((e) => e.start <= year).sort((a, b) => b.start - a.start)[0];
    return era ? `${era.reset ? year - era.start + 1 : year} ${era.name}` : String(year);
  }
  format(d) {
    return `${d.day} de ${this.c.months[this.monthIndex(d.month)].name}, ano ${this.yearLabel(d.year)}`;
  }
  eventOn(event, d) {
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
  eventsOn(d) { return this.c.events.filter((e) => this.eventOn(e, d)); }
  firstOccurrenceInYear(event, year) {
    const first = this.yearStart(year), end = this.yearStart(year + 1);
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
    let e = Math.max(first, Math.ceil(start + (Math.ceil((first - start) / cycle) - 1) * cycle));
    const next = Math.max(first, Math.ceil(start + Math.ceil((first - start) / cycle) * cycle));
    if (e >= end || !this.eventOn(event, this.fromEpoch(e))) e = next;
    return e < end && this.eventOn(event, this.fromEpoch(e)) ? this.fromEpoch(e) : null;
  }
  rows(year, month) {
    const rows = [], width = this.c.week.length;
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
  });
  unique(c.months.map((x) => x.id), 'IDs dos meses');
  unique(c.months.map((x) => fold(x.name)), 'Nomes dos meses');
  array(c.leapDays, 100, 'Dias especiais').forEach((l) => {
    string(l.id, 100, 'ID do dia especial'); string(l.name, 60, 'Nome do dia especial');
    assert(c.months.some((m) => m.id === l.month), `O mês de ${l.name} não existe.`);
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
  });
  unique(c.moons.map((m) => m.id), 'IDs lunares');
  const e = new CalendarEngine(c);
  if (c.sky !== undefined) validateSky(c.sky);
  assert(c.seasonMode === 'date' || c.seasonMode === 'periodic', 'Tipo de estação inválido.');
  number(c.seasonOffset, -MAX_YEAR, MAX_YEAR, 'Deslocamento das estações');
  const seasons = array(c.seasons, 50, 'Estações');
  seasons.forEach((s) => {
    string(s.id, 100, 'ID da estação'); string(s.name, 60, 'Nome da estação'); validateColor(s.color);
    if (c.seasonMode === 'periodic') number(s.duration, 1, MAX_YEAR, 'Duração da estação');
    else integer(s.day, 1, c.months[e.monthIndex(s.month)].length, 'Dia inicial da estação');
  });
  unique(seasons.map((s) => s.id), 'IDs das estações');
  if (c.seasonMode === 'date') unique(seasons.map((s) => `${s.month}/${s.day}`), 'Datas de estação');
  array(c.eras, 100, 'Eras').forEach((era) => { string(era.name, 60, 'Nome da era'); integer(era.start, 1, MAX_YEAR, 'Ano da era'); });
  unique(c.eras.map((x) => x.start), 'Anos de início das eras');
  assert(c.clock && typeof c.clock === 'object', 'Relógio inválido.');
  integer(c.clock.hours, 1, 100, 'Horas por dia'); integer(c.clock.minutes, 1, 100, 'Minutos por hora');
  e.check(c.current);
  integer(c.current.hour, 0, c.clock.hours - 1, 'Hora atual');
  integer(c.current.minute, 0, c.clock.minutes - 1, 'Minuto atual');
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
  assert(['none', 'year', 'season'].includes(event.repeat), 'Recorrência inválida.');
  if (event.repeat === 'season') assert(c.seasons.some((s) => s.id === event.seasonId), 'A estação desse evento não existe.');
  else {
    const start = e.epoch(event.start);
    if (event.end) {
      assert(e.epoch(event.end) >= start, 'O fim do evento não pode ser anterior ao início.');
      if (event.repeat === 'year') assert(event.end.year - event.start.year <= 1, 'Um evento anual pode cruzar no máximo uma virada de ano.');
    }
  }
}
function sameDate(a, b) { return a.year === b.year && a.month === b.month && a.day === b.day; }
function clockText(d) { return [d.hour, d.minute].map((n) => String(n).padStart(2, '0')).join(':'); }
module.exports = { CalendarEngine, MAX_YEAR, DAYS, assert, copy, uid, fold, newCalendar, validateCalendar, sameDate, clockText };
